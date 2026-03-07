import fs from "fs/promises";
import path from "path";

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

const SESSION_DIR = path.join(process.cwd(), ".creed", "sessions");
const SESSION_ENTRY_DIR = path.join(SESSION_DIR, "entries");
const LATEST_SESSION_PATH = path.join(SESSION_DIR, "latest.json");
const LEGACY_LATEST_SESSION_ID = "legacy-latest";

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

export function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSession(sessionId: string, history: any[]) {
  const payload: StoredSession = {
    version: 1,
    id: sessionId,
    workspace: process.cwd(),
    savedAt: new Date().toISOString(),
    preview: buildSessionPreview(history),
    turnCount: countTurns(history),
    history: cloneHistory(history),
  };

  await fs.mkdir(SESSION_ENTRY_DIR, { recursive: true });
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(getSessionPath(sessionId), serialized, "utf-8");
  await fs.writeFile(LATEST_SESSION_PATH, serialized, "utf-8");
}

export async function loadLatestSession() {
  try {
    const raw = await fs.readFile(LATEST_SESSION_PATH, "utf-8");
    return normalizeStoredSession(JSON.parse(raw) as unknown, LEGACY_LATEST_SESSION_ID);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadSessionById(sessionId: string) {
  if (sessionId === LEGACY_LATEST_SESSION_ID) {
    return loadLatestSession();
  }

  try {
    const raw = await fs.readFile(getSessionPath(sessionId), "utf-8");
    return normalizeStoredSession(JSON.parse(raw) as unknown, sessionId);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function listSavedSessions() {
  const sessions = new Map<string, StoredSession>();

  try {
    const entries = await fs.readdir(SESSION_ENTRY_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const sessionId = entry.name.replace(/\.json$/i, "");
      try {
        const raw = await fs.readFile(path.join(SESSION_ENTRY_DIR, entry.name), "utf-8");
        const session = normalizeStoredSession(JSON.parse(raw) as unknown, sessionId);
        if (!session || session.workspace !== process.cwd()) {
          continue;
        }
        sessions.set(session.id, session);
      } catch {
        // Ignore invalid session files.
      }
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const latestSession = await loadLatestSession();
  if (latestSession && latestSession.workspace === process.cwd() && !sessions.has(latestSession.id)) {
    sessions.set(latestSession.id, latestSession);
  }

  return Array.from(sessions.values())
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .map(toSessionSummary);
}

export function countSessionTurns(history: any[]) {
  return countTurns(history);
}
