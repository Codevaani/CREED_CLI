import fs from "fs";
import os from "os";
import path from "path";

export type RuntimeProvider = "openai-compatible" | "anthropic-compatible";

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  enabled: boolean;
}

export interface CliSettingsInput {
  runtime?: {
    provider?: RuntimeProvider;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };
  shell?: {
    enableUnsafeCommands?: boolean;
  };
  webSearch?: {
    endpoint?: string;
    maxResults?: number;
  };
  ui?: {
    showShellStatusLine?: boolean;
    animateNonInteractiveThinking?: boolean;
    ctrlCConfirmTimeoutMs?: number;
  };
  mcp?: {
    servers?: Record<string, Partial<McpServerConfig> | undefined>;
  };
}

export interface ResolvedCliSettings {
  runtime: {
    provider: RuntimeProvider;
    model: string;
    baseUrl: string;
    apiKey: string;
  };
  shell: {
    enableUnsafeCommands: boolean;
  };
  webSearch: {
    endpoint: string;
    maxResults: number;
  };
  ui: {
    showShellStatusLine: boolean;
    animateNonInteractiveThinking: boolean;
    ctrlCConfirmTimeoutMs: number;
  };
  mcp: {
    servers: Record<string, McpServerConfig>;
  };
}

export type RequiredRuntimeSetting = keyof ResolvedCliSettings["runtime"];

export interface RuntimeSettingsStatus {
  missing: RequiredRuntimeSetting[];
  isConfigured: boolean;
}

export interface PersistedRuntimeSettings {
  provider: RuntimeProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

function normalizeWindowsExecutable(command: string) {
  const trimmed = command.trim();
  if (process.platform !== "win32") {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (["npx", "npm", "pnpm", "yarn", "bunx"].includes(lower)) {
    return `${trimmed}.cmd`;
  }

  return trimmed;
}

interface CachedSettingsSnapshot {
  envKey: string;
  settings: ResolvedCliSettings;
  warnings: string[];
  sources: string[];
}

const DEFAULT_SETTINGS: ResolvedCliSettings = {
  runtime: {
    provider: "openai-compatible",
    model: "",
    baseUrl: "",
    apiKey: "",
  },
  shell: {
    enableUnsafeCommands: false,
  },
  webSearch: {
    endpoint: "https://html.duckduckgo.com/html/",
    maxResults: 50,
  },
  ui: {
    showShellStatusLine: true,
    animateNonInteractiveThinking: true,
    ctrlCConfirmTimeoutMs: 2000,
  },
  mcp: {
    servers: {},
  },
};

const settingsCache = new Map<string, CachedSettingsSnapshot>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDefaultSettings(): ResolvedCliSettings {
  return {
    runtime: { ...DEFAULT_SETTINGS.runtime },
    shell: { ...DEFAULT_SETTINGS.shell },
    webSearch: { ...DEFAULT_SETTINGS.webSearch },
    ui: { ...DEFAULT_SETTINGS.ui },
    mcp: {
      servers: {},
    },
  };
}

function normalizeMcpServerConfig(value: unknown): McpServerConfig | undefined {
  if (!isRecord(value) || typeof value.command !== "string") {
    return undefined;
  }

  const args = Array.isArray(value.args)
    ? value.args.filter((entry): entry is string => typeof entry === "string")
    : [];

  const env = isRecord(value.env)
    ? Object.fromEntries(
        Object.entries(value.env).filter(
          (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
        ),
      )
    : {};

  return {
    command: normalizeWindowsExecutable(value.command),
    args,
    env,
    cwd: typeof value.cwd === "string" ? value.cwd : undefined,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
  };
}

function parseBooleanEnv(value: string | undefined) {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return undefined;
}

function parseIntegerEnv(value: string | undefined) {
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mergeSettings(base: ResolvedCliSettings, override?: CliSettingsInput) {
  if (!override) {
    return base;
  }

  if (override.runtime) {
    base.runtime = {
      ...base.runtime,
      ...override.runtime,
    };
  }

  if (override.shell) {
    base.shell = {
      ...base.shell,
      ...override.shell,
    };
  }

  if (override.webSearch) {
    base.webSearch = {
      ...base.webSearch,
      ...override.webSearch,
    };
  }

  if (override.ui) {
    base.ui = {
      ...base.ui,
      ...override.ui,
    };
  }

  if (override.mcp?.servers) {
    base.mcp = {
      servers: {
        ...base.mcp.servers,
        ...Object.fromEntries(
          Object.entries(override.mcp.servers).flatMap(([name, serverConfig]) => {
            const normalizedServer = normalizeMcpServerConfig(serverConfig);
            return normalizedServer ? [[name, normalizedServer]] : [];
          }),
        ),
      },
    };
  }

  return base;
}

function normalizeSettingsShape(raw: Record<string, unknown>): CliSettingsInput {
  const normalized: CliSettingsInput = {};

  if (typeof raw.model === "string" || typeof raw.baseUrl === "string" || typeof raw.apiKey === "string") {
    normalized.runtime = {
      provider: raw.provider === "anthropic-compatible" ? "anthropic-compatible" : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : undefined,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
    };
  }

  if (typeof raw.enableUnsafeCommands === "boolean") {
    normalized.shell = {
      enableUnsafeCommands: raw.enableUnsafeCommands,
    };
  }

  if (typeof raw.webSearchEndpoint === "string" || typeof raw.webSearchMaxResults === "number") {
    normalized.webSearch = {
      endpoint: typeof raw.webSearchEndpoint === "string" ? raw.webSearchEndpoint : undefined,
      maxResults: typeof raw.webSearchMaxResults === "number" ? raw.webSearchMaxResults : undefined,
    };
  }

  if (
    typeof raw.showShellStatusLine === "boolean" ||
    typeof raw.animateNonInteractiveThinking === "boolean" ||
    typeof raw.ctrlCConfirmTimeoutMs === "number"
  ) {
    normalized.ui = {
      showShellStatusLine:
        typeof raw.showShellStatusLine === "boolean" ? raw.showShellStatusLine : undefined,
      animateNonInteractiveThinking:
        typeof raw.animateNonInteractiveThinking === "boolean"
          ? raw.animateNonInteractiveThinking
          : undefined,
      ctrlCConfirmTimeoutMs:
        typeof raw.ctrlCConfirmTimeoutMs === "number" ? raw.ctrlCConfirmTimeoutMs : undefined,
    };
  }

  if (isRecord(raw.runtime)) {
    normalized.runtime = {
      ...normalized.runtime,
      provider:
        raw.runtime.provider === "openai-compatible" || raw.runtime.provider === "anthropic-compatible"
          ? raw.runtime.provider
          : normalized.runtime?.provider,
      model: typeof raw.runtime.model === "string" ? raw.runtime.model : normalized.runtime?.model,
      baseUrl:
        typeof raw.runtime.baseUrl === "string" ? raw.runtime.baseUrl : normalized.runtime?.baseUrl,
      apiKey: typeof raw.runtime.apiKey === "string" ? raw.runtime.apiKey : normalized.runtime?.apiKey,
    };
  }

  if (isRecord(raw.shell)) {
    normalized.shell = {
      ...normalized.shell,
      enableUnsafeCommands:
        typeof raw.shell.enableUnsafeCommands === "boolean"
          ? raw.shell.enableUnsafeCommands
          : normalized.shell?.enableUnsafeCommands,
    };
  }

  if (isRecord(raw.webSearch)) {
    normalized.webSearch = {
      ...normalized.webSearch,
      endpoint:
        typeof raw.webSearch.endpoint === "string"
          ? raw.webSearch.endpoint
          : normalized.webSearch?.endpoint,
      maxResults:
        typeof raw.webSearch.maxResults === "number"
          ? raw.webSearch.maxResults
          : normalized.webSearch?.maxResults,
    };
  }

  if (isRecord(raw.ui)) {
    normalized.ui = {
      ...normalized.ui,
      showShellStatusLine:
        typeof raw.ui.showShellStatusLine === "boolean"
          ? raw.ui.showShellStatusLine
          : normalized.ui?.showShellStatusLine,
      animateNonInteractiveThinking:
        typeof raw.ui.animateNonInteractiveThinking === "boolean"
          ? raw.ui.animateNonInteractiveThinking
          : normalized.ui?.animateNonInteractiveThinking,
      ctrlCConfirmTimeoutMs:
        typeof raw.ui.ctrlCConfirmTimeoutMs === "number"
          ? raw.ui.ctrlCConfirmTimeoutMs
          : normalized.ui?.ctrlCConfirmTimeoutMs,
    };
  }

  if (isRecord(raw.mcp)) {
    const servers = isRecord(raw.mcp.servers)
      ? Object.fromEntries(
          Object.entries(raw.mcp.servers).flatMap(([name, value]) => {
            const normalizedServer = normalizeMcpServerConfig(value);
            return normalizedServer ? [[name, normalizedServer]] : [];
          }),
        )
      : undefined;

    normalized.mcp = {
      servers,
    };
  }

  return normalized;
}

function readSettingsFile(filePath: string, warnings: string[]) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const parsedContent = JSON.parse(rawContent) as unknown;

    if (!isRecord(parsedContent)) {
      warnings.push(`Ignoring ${filePath} because it does not contain a JSON object.`);
      return undefined;
    }

    return normalizeSettingsShape(parsedContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Ignoring invalid settings file ${filePath}: ${message}`);
    return undefined;
  }
}

function normalizeMcpSettingsShape(raw: Record<string, unknown>): CliSettingsInput | undefined {
  const container = isRecord(raw.mcp) ? raw.mcp : raw;
  if (!isRecord(container) || !isRecord(container.servers)) {
    return undefined;
  }

  const servers = Object.fromEntries(
    Object.entries(container.servers).flatMap(([name, value]) => {
      const normalizedServer = normalizeMcpServerConfig(value);
      return normalizedServer ? [[name, normalizedServer]] : [];
    }),
  );

  return {
    mcp: {
      servers,
    },
  };
}

function readMcpFile(filePath: string, warnings: string[]) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const parsedContent = JSON.parse(rawContent) as unknown;

    if (!isRecord(parsedContent)) {
      warnings.push(`Ignoring ${filePath} because it does not contain a JSON object.`);
      return undefined;
    }

    const normalized = normalizeMcpSettingsShape(parsedContent);
    if (!normalized) {
      warnings.push(`Ignoring ${filePath} because it does not contain an MCP server map.`);
      return undefined;
    }

    return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Ignoring invalid MCP file ${filePath}: ${message}`);
    return undefined;
  }
}

export function getUserSettingsPath() {
  return path.join(os.homedir(), ".creed", "settings.json");
}

export function getUserMcpPath() {
  return path.join(os.homedir(), ".creed", "mcp.json");
}

export function getWorkspaceSettingsPath(workspaceRoot = process.cwd()) {
  return path.join(path.resolve(workspaceRoot), ".creed", "settings.json");
}

function resolveSettingsPaths(workspaceRoot: string) {
  const userSettingsPath = getUserSettingsPath();
  const userMcpPath = getUserMcpPath();
  const workspaceSettingsPath = path.join(workspaceRoot, ".creed", "settings.json");

  return {
    userSettingsPath,
    userMcpPath,
    workspaceSettingsPath,
  };
}

function applyEnvironmentOverrides(settings: ResolvedCliSettings) {
  if (process.env.CREED_PROVIDER === "openai-compatible" || process.env.CREED_PROVIDER === "anthropic-compatible") {
    settings.runtime.provider = process.env.CREED_PROVIDER;
  }

  settings.runtime.model = process.env.CREED_MODEL ?? process.env.OPENAI_MODEL ?? settings.runtime.model;
  settings.runtime.baseUrl =
    process.env.CREED_BASE_URL ?? process.env.OPENAI_BASE_URL ?? settings.runtime.baseUrl;
  settings.runtime.apiKey =
    process.env.CREED_API_KEY ?? process.env.OPENAI_API_KEY ?? settings.runtime.apiKey;

  const unsafeCommandsOverride = parseBooleanEnv(process.env.CREED_ENABLE_UNSAFE_COMMAND_TOOL);
  if (unsafeCommandsOverride !== undefined) {
    settings.shell.enableUnsafeCommands = unsafeCommandsOverride;
  }

  settings.webSearch.endpoint =
    process.env.CREED_WEB_SEARCH_ENDPOINT ?? settings.webSearch.endpoint;

  const webSearchMaxResultsOverride = parseIntegerEnv(process.env.CREED_WEB_SEARCH_MAX_RESULTS);
  if (webSearchMaxResultsOverride !== undefined) {
    settings.webSearch.maxResults = webSearchMaxResultsOverride;
  }

  const animateThinkingOverride = parseBooleanEnv(process.env.CREED_ANIMATE_NON_INTERACTIVE_THINKING);
  if (animateThinkingOverride !== undefined) {
    settings.ui.animateNonInteractiveThinking = animateThinkingOverride;
  }

  const ctrlCConfirmTimeoutOverride = parseIntegerEnv(process.env.CREED_CTRL_C_CONFIRM_TIMEOUT_MS);
  if (ctrlCConfirmTimeoutOverride !== undefined) {
    settings.ui.ctrlCConfirmTimeoutMs = ctrlCConfirmTimeoutOverride;
  }

  const showShellStatusOverride = parseBooleanEnv(process.env.CREED_SHOW_SHELL_STATUS_LINE);
  if (showShellStatusOverride !== undefined) {
    settings.ui.showShellStatusLine = showShellStatusOverride;
  }
}

function finalizeSettings(settings: ResolvedCliSettings) {
  settings.runtime.provider =
    settings.runtime.provider === "anthropic-compatible" ? "anthropic-compatible" : "openai-compatible";
  settings.runtime.model = settings.runtime.model.trim();
  settings.runtime.baseUrl = settings.runtime.baseUrl.trim();
  settings.runtime.apiKey = settings.runtime.apiKey.trim();
  settings.webSearch.maxResults = Math.max(1, Math.min(10, Math.floor(settings.webSearch.maxResults)));
  settings.ui.ctrlCConfirmTimeoutMs = Math.max(
    500,
    Math.min(10_000, Math.floor(settings.ui.ctrlCConfirmTimeoutMs)),
  );
  settings.mcp.servers = Object.fromEntries(
    Object.entries(settings.mcp.servers).flatMap(([name, serverConfig]) => {
      const normalizedName = name.trim();
      const normalizedCommand = normalizeWindowsExecutable(serverConfig.command);

      if (!normalizedName || !normalizedCommand) {
        return [];
      }

      return [[
        normalizedName,
        {
          command: normalizedCommand,
          args: serverConfig.args.map((arg) => arg.trim()).filter(Boolean),
          env: Object.fromEntries(
            Object.entries(serverConfig.env).map(([key, value]) => [key.trim(), value]),
          ),
          cwd: serverConfig.cwd?.trim() || undefined,
          enabled: serverConfig.enabled !== false,
        },
      ]];
    }),
  );

  return settings;
}

function withoutMcpSettings(input?: CliSettingsInput) {
  if (!input?.mcp) {
    return input;
  }

  const nextSettings: CliSettingsInput = { ...input };
  delete nextSettings.mcp;

  return Object.keys(nextSettings).length === 0 ? undefined : nextSettings;
}

function getSettingsSnapshot(workspaceRoot = process.cwd()) {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const envKey = JSON.stringify({
    CREED_MODEL: process.env.CREED_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    CREED_PROVIDER: process.env.CREED_PROVIDER,
    CREED_BASE_URL: process.env.CREED_BASE_URL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    CREED_API_KEY: process.env.CREED_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CREED_ENABLE_UNSAFE_COMMAND_TOOL: process.env.CREED_ENABLE_UNSAFE_COMMAND_TOOL,
    CREED_WEB_SEARCH_ENDPOINT: process.env.CREED_WEB_SEARCH_ENDPOINT,
    CREED_WEB_SEARCH_MAX_RESULTS: process.env.CREED_WEB_SEARCH_MAX_RESULTS,
    CREED_ANIMATE_NON_INTERACTIVE_THINKING: process.env.CREED_ANIMATE_NON_INTERACTIVE_THINKING,
    CREED_CTRL_C_CONFIRM_TIMEOUT_MS: process.env.CREED_CTRL_C_CONFIRM_TIMEOUT_MS,
    CREED_SHOW_SHELL_STATUS_LINE: process.env.CREED_SHOW_SHELL_STATUS_LINE,
  });

  const cachedSettings = settingsCache.get(normalizedWorkspaceRoot);
  if (cachedSettings && cachedSettings.envKey === envKey) {
    return cachedSettings;
  }

  const warnings: string[] = [];
  const settings = cloneDefaultSettings();
  const { userSettingsPath, userMcpPath, workspaceSettingsPath } = resolveSettingsPaths(normalizedWorkspaceRoot);
  const hasUserMcpFile = fs.existsSync(userMcpPath);
  const userSettings = hasUserMcpFile
    ? withoutMcpSettings(readSettingsFile(userSettingsPath, warnings))
    : readSettingsFile(userSettingsPath, warnings);
  const userMcpSettings = readMcpFile(userMcpPath, warnings);
  const workspaceSettings = readSettingsFile(workspaceSettingsPath, warnings);
  const sources = [userSettingsPath, userMcpPath, workspaceSettingsPath].filter((filePath) => fs.existsSync(filePath));

  mergeSettings(settings, userSettings);
  mergeSettings(settings, userMcpSettings);
  mergeSettings(settings, workspaceSettings);
  applyEnvironmentOverrides(settings);

  const snapshot: CachedSettingsSnapshot = {
    envKey,
    settings: finalizeSettings(settings),
    warnings,
    sources,
  };

  settingsCache.set(normalizedWorkspaceRoot, snapshot);
  return snapshot;
}

export function getCliSettings(workspaceRoot = process.cwd()) {
  return getSettingsSnapshot(workspaceRoot).settings;
}

export function getCliSettingsWarnings(workspaceRoot = process.cwd()) {
  return [...getSettingsSnapshot(workspaceRoot).warnings];
}

export function getCliSettingsSources(workspaceRoot = process.cwd()) {
  return [...getSettingsSnapshot(workspaceRoot).sources];
}

export function clearCliSettingsCache(workspaceRoot?: string) {
  if (!workspaceRoot) {
    settingsCache.clear();
    return;
  }

  settingsCache.delete(path.resolve(workspaceRoot));
}

function readExistingSettingsObject(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readExistingMcpFileObject(filePath: string, legacySettingsPath?: string) {
  const existingMcpFile = readExistingSettingsObject(filePath);
  if (Object.keys(existingMcpFile).length > 0) {
    return isRecord(existingMcpFile.mcp) ? { ...existingMcpFile.mcp } : existingMcpFile;
  }

  if (!legacySettingsPath) {
    return {};
  }

  const existingSettings = readExistingSettingsObject(legacySettingsPath);
  return isRecord(existingSettings.mcp) ? { ...existingSettings.mcp } : {};
}

async function stripUserMcpFromSettings() {
  const settingsPath = getUserSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return;
  }

  const existingSettings = readExistingSettingsObject(settingsPath);
  if (!isRecord(existingSettings.mcp)) {
    return;
  }

  const nextSettings = { ...existingSettings } as Record<string, unknown>;
  delete nextSettings.mcp;

  if (Object.keys(nextSettings).length === 0) {
    await fs.promises.rm(settingsPath, { force: true });
    return;
  }

  await fs.promises.writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf-8");
}

export async function saveUserRuntimeSettings(runtime: PersistedRuntimeSettings) {
  const settingsPath = getUserSettingsPath();
  const existingSettings = readExistingSettingsObject(settingsPath);
  const existingRuntime = isRecord(existingSettings.runtime) ? existingSettings.runtime : {};
  const nextSettings = {
    ...existingSettings,
    runtime: {
      ...existingRuntime,
      provider: runtime.provider,
      baseUrl: runtime.baseUrl.trim(),
      apiKey: runtime.apiKey.trim(),
      model: runtime.model.trim(),
    },
  };

  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf-8");
  clearCliSettingsCache();
}

export async function clearUserRuntimeSettings() {
  const settingsPath = getUserSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    clearCliSettingsCache();
    return;
  }

  const existingSettings = readExistingSettingsObject(settingsPath);
  const nextSettings = { ...existingSettings } as Record<string, unknown>;
  delete nextSettings.runtime;

  if (Object.keys(nextSettings).length === 0) {
    await fs.promises.rm(settingsPath, { force: true });
  } else {
    await fs.promises.writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf-8");
  }

  clearCliSettingsCache();
}

export async function saveUserMcpServer(name: string, server: McpServerConfig) {
  const settingsPath = getUserSettingsPath();
  const mcpPath = getUserMcpPath();
  const existingMcp = readExistingMcpFileObject(mcpPath, settingsPath);
  const existingServers = isRecord(existingMcp.servers) ? existingMcp.servers : {};
  const normalizedServer = normalizeMcpServerConfig(server);

  if (!normalizedServer) {
    throw new Error("Invalid MCP server configuration.");
  }

  const nextMcp = {
    ...existingMcp,
    servers: {
      ...existingServers,
      [name]: normalizedServer,
    },
  };

  await fs.promises.mkdir(path.dirname(mcpPath), { recursive: true });
  await fs.promises.writeFile(mcpPath, `${JSON.stringify(nextMcp, null, 2)}\n`, "utf-8");
  await stripUserMcpFromSettings();
  clearCliSettingsCache();
}

export async function removeUserMcpServer(name: string) {
  const settingsPath = getUserSettingsPath();
  const mcpPath = getUserMcpPath();
  const existingMcp = readExistingMcpFileObject(mcpPath, settingsPath);
  const existingServers = isRecord(existingMcp.servers) ? { ...existingMcp.servers } : {};

  if (!(name in existingServers)) {
    clearCliSettingsCache();
    return false;
  }

  delete existingServers[name];

  const nextMcp = {
    ...existingMcp,
    servers: existingServers,
  };

  await fs.promises.mkdir(path.dirname(mcpPath), { recursive: true });
  await fs.promises.writeFile(mcpPath, `${JSON.stringify(nextMcp, null, 2)}\n`, "utf-8");
  await stripUserMcpFromSettings();
  clearCliSettingsCache();
  return true;
}

export function getRuntimeSettingsStatus(workspaceRoot = process.cwd()): RuntimeSettingsStatus {
  const settings = getCliSettings(workspaceRoot);
  const missing: RequiredRuntimeSetting[] = [];

  if (!settings.runtime.baseUrl) {
    missing.push("baseUrl");
  }

  if (!settings.runtime.apiKey) {
    missing.push("apiKey");
  }

  if (!settings.runtime.model) {
    missing.push("model");
  }

  return {
    missing,
    isConfigured: missing.length === 0,
  };
}
