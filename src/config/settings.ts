import fs from "fs";
import os from "os";
import path from "path";

export interface CliSettingsInput {
  runtime?: {
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
}

export interface ResolvedCliSettings {
  runtime: {
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
}

export type RequiredRuntimeSetting = keyof ResolvedCliSettings["runtime"];

export interface RuntimeSettingsStatus {
  missing: RequiredRuntimeSetting[];
  isConfigured: boolean;
}

interface CachedSettingsSnapshot {
  envKey: string;
  settings: ResolvedCliSettings;
  warnings: string[];
  sources: string[];
}

const DEFAULT_SETTINGS: ResolvedCliSettings = {
  runtime: {
    model: "",
    baseUrl: "",
    apiKey: "",
  },
  shell: {
    enableUnsafeCommands: false,
  },
  webSearch: {
    endpoint: "https://html.duckduckgo.com/html/",
    maxResults: 5,
  },
  ui: {
    showShellStatusLine: true,
    animateNonInteractiveThinking: true,
    ctrlCConfirmTimeoutMs: 2000,
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

  return base;
}

function normalizeSettingsShape(raw: Record<string, unknown>): CliSettingsInput {
  const normalized: CliSettingsInput = {};

  if (typeof raw.model === "string" || typeof raw.baseUrl === "string" || typeof raw.apiKey === "string") {
    normalized.runtime = {
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

function resolveSettingsPaths(workspaceRoot: string) {
  const userSettingsPath = path.join(process.env.CREED_HOME ?? os.homedir(), ".creed", "settings.json");
  const workspaceSettingsPath = path.join(workspaceRoot, ".creed", "settings.json");

  return {
    userSettingsPath,
    workspaceSettingsPath,
  };
}

function applyEnvironmentOverrides(settings: ResolvedCliSettings) {
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
  settings.runtime.model = settings.runtime.model.trim();
  settings.runtime.baseUrl = settings.runtime.baseUrl.trim();
  settings.runtime.apiKey = settings.runtime.apiKey.trim();
  settings.webSearch.maxResults = Math.max(1, Math.min(10, Math.floor(settings.webSearch.maxResults)));
  settings.ui.ctrlCConfirmTimeoutMs = Math.max(
    500,
    Math.min(10_000, Math.floor(settings.ui.ctrlCConfirmTimeoutMs)),
  );

  return settings;
}

function getSettingsSnapshot(workspaceRoot = process.cwd()) {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const envKey = JSON.stringify({
    CREED_MODEL: process.env.CREED_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
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
  const { userSettingsPath, workspaceSettingsPath } = resolveSettingsPaths(normalizedWorkspaceRoot);
  const userSettings = readSettingsFile(userSettingsPath, warnings);
  const workspaceSettings = readSettingsFile(workspaceSettingsPath, warnings);
  const sources = [userSettingsPath, workspaceSettingsPath].filter((filePath) => fs.existsSync(filePath));

  mergeSettings(settings, userSettings);
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
