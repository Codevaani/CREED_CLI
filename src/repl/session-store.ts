import fs from "fs/promises";
import path from "path";
import { Database } from "bun:sqlite";

export interface StoredSession {
  version: 1;
  id: string;
  workspace: string;
  savedAt: string;
  preview: string;
  turnCount: number;
  history: any[];
}

export interface StoredSessionSummary {
  id: string;
  workspace: string;
  savedAt: string;
  preview: string;
  turnCount: number;
}

interface SessionRow {
  version: number;
  id: string;
  workspace: string;
  saved_at: string;
  preview: string;
  turn_count: number;
  history_json: string;
}

const CREED_DIR = path.join(process.cwd(), ".creed");
const SESSION_DIR = path.join(CREED_DIR, "sessions");
const SESSION_ENTRY_DIR = path.join(SESSION_DIR, "entries");
const LATEST_SESSION_PATH = path.join(SESSION_DIR, "latest.json");
const SESSION_DB_PATH = path.join(CREED_DIR, "sessions.sqlite");
const LEGACY_LATEST_SESSION_ID = "legacy-latest";
const META_LATEST_SESSION_ID = "latest_session_id";
const META_LEGACY_MIGRATION_DONE = "legacy_json_migrated_at";

let sessionDb: Database | null = null;
let sessionDbReady: Promise<Database> | null = null;

function cloneHistory(history: any[]) {
  return JSON.parse(JSON.stringify(history));
}

function extractUserQuery(content: string) {
  const match = typeof content === "string"
    ? content.match(/^<user_query>\n?([\s\S]*?)\n?<\/user_query>$/)
    : null;

  return match?.[1]?.trim() ?? (typeof content === "string" ? content.trim() : "");
}

function buildSessionPreview(history: any[]) {
  const firstUserMessage = history.find((message) => message?.role === "user" && typeof message.content === "string");
  const rawPreview = firstUserMessage ? extractUserQuery(firstUserMessage.content) : "";
  const collapsed = rawPreview.replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return "Untitled conversation";
  }

  if (collapsed.length <= 72) {
    return collapsed;
  }

  return `${collapsed.slice(0, 69)}...`;
}

function countTurns(history: any[]) {
  return history.filter((message) => message?.role === "user").length;
}

function normalizeStoredSession(value: unknown, fallbackId: string): StoredSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredSession> & {
    history?: any[];
    workspace?: string;
    savedAt?: string;
    preview?: string;
    turnCount?: number;
  };

  if (
    candidate.version !== 1 ||
    typeof candidate.workspace !== "string" ||
    typeof candidate.savedAt !== "string" ||
    !Array.isArray(candidate.history)
  ) {
    return null;
  }

  const history = cloneHistory(candidate.history);
  return {
    version: 1,
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : fallbackId,
    workspace: candidate.workspace,
    savedAt: candidate.savedAt,
    preview: typeof candidate.preview === "string" && candidate.preview.trim()
      ? candidate.preview
      : buildSessionPreview(history),
    turnCount: typeof candidate.turnCount === "number" && Number.isFinite(candidate.turnCount)
      ? candidate.turnCount
      : countTurns(history),
    history,
  };
}

function toSessionSummary(session: StoredSession): StoredSessionSummary {
  return {
    id: session.id,
    workspace: session.workspace,
    savedAt: session.savedAt,
    preview: session.preview,
    turnCount: session.turnCount,
  };
}

function getSessionPath(sessionId: string) {
  return path.join(SESSION_ENTRY_DIR, `${sessionId}.json`);
}

function deserializeSessionRow(row: SessionRow | null | undefined): StoredSession | null {
  if (!row || row.version !== 1) {
    return null;
  }

  try {
    const parsedHistory = JSON.parse(row.history_json) as unknown;
    if (!Array.isArray(parsedHistory)) {
      return null;
    }

    const history = cloneHistory(parsedHistory);
    return {
      version: 1,
      id: row.id,
      workspace: row.workspace,
      savedAt: row.saved_at,
      preview: row.preview,
      turnCount: row.turn_count,
      history,
    };
  } catch {
    return null;
  }
}

async function readLegacySessionFile(filePath: string, fallbackId: string) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return normalizeStoredSession(JSON.parse(raw) as unknown, fallbackId);
  } catch {
    return null;
  }
}

function ensureSessionTables(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      workspace TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      preview TEXT NOT NULL,
      turn_count INTEGER NOT NULL,
      history_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_workspace_saved_at
      ON sessions (workspace, saved_at DESC);
  `);
}

function upsertSessionRow(db: Database, session: StoredSession) {
  db.query(`
    INSERT INTO sessions (
      id,
      version,
      workspace,
      saved_at,
      preview,
      turn_count,
      history_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      workspace = excluded.workspace,
      saved_at = excluded.saved_at,
      preview = excluded.preview,
      turn_count = excluded.turn_count,
      history_json = excluded.history_json
  `).run(
    session.id,
    session.version,
    session.workspace,
    session.savedAt,
    session.preview,
    session.turnCount,
    JSON.stringify(session.history),
  );
}

function setMetaValue(db: Database, key: string, value: string) {
  db.query(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function getMetaValue(db: Database, key: string) {
  const row = db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

async function migrateLegacySessions(db: Database) {
  if (getMetaValue(db, META_LEGACY_MIGRATION_DONE)) {
    return;
  }

  const importedSessions: StoredSession[] = [];

  try {
    const entries = await fs.readdir(SESSION_ENTRY_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const sessionId = entry.name.replace(/\.json$/i, "");
      const session = await readLegacySessionFile(path.join(SESSION_ENTRY_DIR, entry.name), sessionId);
      if (session) {
        importedSessions.push(session);
      }
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const latestLegacySession = await readLegacySessionFile(LATEST_SESSION_PATH, LEGACY_LATEST_SESSION_ID);
  if (latestLegacySession && !importedSessions.some((session) => session.id === latestLegacySession.id)) {
    importedSessions.push(latestLegacySession);
  }

  if (importedSessions.length > 0) {
    const migrate = db.transaction((sessions: StoredSession[], latestSessionId: string | null) => {
      for (const session of sessions) {
        upsertSessionRow(db, session);
      }

      if (latestSessionId) {
        setMetaValue(db, META_LATEST_SESSION_ID, latestSessionId);
      }
    });

    migrate(importedSessions, latestLegacySession?.id ?? null);
  }

  setMetaValue(db, META_LEGACY_MIGRATION_DONE, new Date().toISOString());
}

async function getSessionDb() {
  if (sessionDb) {
    return sessionDb;
  }

  if (sessionDbReady) {
    return sessionDbReady;
  }

  sessionDbReady = (async () => {
    await fs.mkdir(CREED_DIR, { recursive: true });
    const db = new Database(SESSION_DB_PATH, { create: true });
    ensureSessionTables(db);
    await migrateLegacySessions(db);
    sessionDb = db;
    return db;
  })();

  return sessionDbReady;
}

export function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSession(sessionId: string, history: any[]) {
  const db = await getSessionDb();
  const payload: StoredSession = {
    version: 1,
    id: sessionId,
    workspace: process.cwd(),
    savedAt: new Date().toISOString(),
    preview: buildSessionPreview(history),
    turnCount: countTurns(history),
    history: cloneHistory(history),
  };

  const save = db.transaction((session: StoredSession) => {
    upsertSessionRow(db, session);
    setMetaValue(db, META_LATEST_SESSION_ID, session.id);
  });

  save(payload);
}

export async function loadLatestSession() {
  const db = await getSessionDb();
  const latestSessionId = getMetaValue(db, META_LATEST_SESSION_ID);

  if (latestSessionId) {
    const row = db.query(`
      SELECT version, id, workspace, saved_at, preview, turn_count, history_json
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `).get(latestSessionId) as SessionRow | null;

    const session = deserializeSessionRow(row);
    if (session) {
      return session;
    }
  }

  const fallbackRow = db.query(`
    SELECT version, id, workspace, saved_at, preview, turn_count, history_json
    FROM sessions
    ORDER BY saved_at DESC
    LIMIT 1
  `).get() as SessionRow | null;

  return deserializeSessionRow(fallbackRow);
}

export async function loadSessionById(sessionId: string) {
  if (sessionId === LEGACY_LATEST_SESSION_ID) {
    return loadLatestSession();
  }

  const db = await getSessionDb();
  const row = db.query(`
    SELECT version, id, workspace, saved_at, preview, turn_count, history_json
    FROM sessions
    WHERE id = ?
    LIMIT 1
  `).get(sessionId) as SessionRow | null;

  return deserializeSessionRow(row);
}

export async function listSavedSessions() {
  const db = await getSessionDb();
  const rows = db.query(`
    SELECT version, id, workspace, saved_at, preview, turn_count, history_json
    FROM sessions
    WHERE workspace = ?
    ORDER BY saved_at DESC
  `).all(process.cwd()) as SessionRow[];

  return rows
    .map((row) => deserializeSessionRow(row))
    .filter((session): session is StoredSession => Boolean(session))
    .map(toSessionSummary);
}

export function countSessionTurns(history: any[]) {
  return countTurns(history);
}
