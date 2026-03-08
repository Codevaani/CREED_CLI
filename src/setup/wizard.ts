import readline from "readline";
import pc from "picocolors";
import {
  getCliSettings,
  getRuntimeSettingsStatus,
  getUserSettingsPath,
  saveUserRuntimeSettings,
  type PersistedRuntimeSettings,
  type RuntimeProvider,
} from "../config/settings";
import { testRuntimeConnection } from "../runtime/client";

const BOX = {
  topLeft: "\u250c",
  topRight: "\u2510",
  bottomLeft: "\u2514",
  bottomRight: "\u2518",
  horizontal: "\u2500",
  vertical: "\u2502",
};

const PROVIDER_OPTIONS: Array<{
  id: RuntimeProvider;
  label: string;
  hint: string;
  defaultBaseUrl: string;
}> = [
  {
    id: "openai-compatible",
    label: "OpenAI compatible",
    hint: "Uses chat completions compatible endpoints.",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic-compatible",
    label: "Anthropic compatible",
    hint: "Uses Anthropic messages compatible endpoints.",
    defaultBaseUrl: "https://api.anthropic.com",
  },
];

type SetupStep = "provider" | "credentials";
type FocusTarget = 0 | 1 | 2 | 3 | 4;
type StatusTone = "info" | "success" | "error";

interface WizardStatus {
  tone: StatusTone;
  message: string;
}

interface SetupState {
  step: SetupStep;
  providerSelection: number;
  runtime: PersistedRuntimeSettings;
  focus: FocusTarget;
  cursors: {
    baseUrl: number;
    apiKey: number;
    model: number;
  };
  buttonSelection: 0 | 1;
  status: WizardStatus | null;
  isBusy: boolean;
  lastValidatedKey: string | null;
}

function visibleLength(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function padVisible(text: string, width: number) {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function fitText(text: string, width: number) {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width <= 3) return ".".repeat(width);
  return `${text.slice(0, width - 3)}...`;
}

function wrapText(text: string, width: number) {
  if (width <= 4) {
    return [text.slice(0, Math.max(0, width))];
  }

  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= width) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word.length <= width ? word : fitText(word, width);
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function getPanelWidth() {
  const terminalWidth = process.stdout.columns ?? 100;
  return Math.max(78, Math.min(terminalWidth - 4, 110));
}

function maskSecret(value: string) {
  return value ? "\u2022".repeat(value.length) : "";
}

function getStatusColor(tone: StatusTone) {
  if (tone === "success") return pc.green;
  if (tone === "error") return pc.red;
  return pc.yellow;
}

function buildFrame(title: string, bodyLines: string[], footer?: string) {
  const width = getPanelWidth();
  const innerWidth = width - 2;
  const rightLabel = footer ? ` ${fitText(footer, Math.max(10, innerWidth - 8))} ` : "";
  const fillerWidth = Math.max(1, innerWidth - 1 - visibleLength(rightLabel));
  const top = pc.gray(
    `${BOX.topLeft}${BOX.horizontal}${BOX.horizontal.repeat(fillerWidth - 1)}${rightLabel}${BOX.topRight}`,
  );
  const titleLines = wrapText(title, innerWidth - 2).map((line) =>
    `${pc.gray(BOX.vertical)} ${padVisible(pc.bold(pc.white(line)), innerWidth - 1)}${pc.gray(BOX.vertical)}`,
  );
  const contentLines = bodyLines.map((line) =>
    `${pc.gray(BOX.vertical)} ${padVisible(line, innerWidth - 1)}${pc.gray(BOX.vertical)}`,
  );
  const bottom = pc.gray(`${BOX.bottomLeft}${BOX.horizontal.repeat(innerWidth)}${BOX.bottomRight}`);

  return [top, ...titleLines, ...contentLines, bottom];
}

function getProviderIndex(provider: RuntimeProvider) {
  const optionIndex = PROVIDER_OPTIONS.findIndex((option) => option.id === provider);
  return optionIndex >= 0 ? optionIndex : 0;
}

function getProviderOption(provider: RuntimeProvider) {
  return PROVIDER_OPTIONS[getProviderIndex(provider)] ?? PROVIDER_OPTIONS[0]!;
}

function getConfigKey(runtime: PersistedRuntimeSettings) {
  return JSON.stringify({
    provider: runtime.provider,
    baseUrl: runtime.baseUrl.trim(),
    apiKey: runtime.apiKey.trim(),
    model: runtime.model.trim(),
  });
}

function ensureProviderDefaults(state: SetupState, nextProvider: RuntimeProvider) {
  const previousProvider = state.runtime.provider;
  const previousDefaults = getProviderOption(previousProvider);
  const nextDefaults = getProviderOption(nextProvider);

  state.runtime.provider = nextProvider;

  if (!state.runtime.baseUrl || state.runtime.baseUrl === previousDefaults?.defaultBaseUrl) {
    state.runtime.baseUrl = nextDefaults?.defaultBaseUrl ?? "";
    state.cursors.baseUrl = state.runtime.baseUrl.length;
  }
}

function buildFieldValue(value: string, cursor: number, width: number, placeholder: string, secret = false) {
  const displayValue = value ? (secret ? maskSecret(value) : value) : pc.gray(placeholder);

  if (!value) {
    const blankSpace = Math.max(0, width - visibleLength(displayValue));
    return `${displayValue}${" ".repeat(blankSpace)}`;
  }

  const rawDisplay = secret ? maskSecret(value) : value;
  let viewStart = Math.max(0, cursor - width + 1);
  if (rawDisplay.length - viewStart < width) {
    viewStart = Math.max(0, rawDisplay.length - width);
  }

  const visible = rawDisplay.slice(viewStart, viewStart + width);
  const cursorIndex = Math.max(0, Math.min(visible.length, cursor - viewStart));
  const beforeCursor = visible.slice(0, cursorIndex);
  const atCursor = visible[cursorIndex] ?? " ";
  const afterCursor = visible.slice(cursorIndex + (visible[cursorIndex] ? 1 : 0));
  const highlighted = `${beforeCursor}${pc.inverse(atCursor)}${afterCursor}`;

  return padVisible(highlighted, width);
}

function buildProviderScreen(state: SetupState) {
  const runtimeStatus = getRuntimeSettingsStatus();
  const bodyLines = [
    pc.gray("Choose the API format you want this CLI to use."),
    "",
    ...PROVIDER_OPTIONS.flatMap((option, index) => {
      const selected = index === state.providerSelection;
      const label = selected
        ? pc.black(pc.bgCyan(` ${option.label} `))
        : pc.white(` ${option.label} `);

      return [
        `${selected ? pc.cyan("\u203a") : " "} ${label}`,
        `  ${pc.gray(option.hint)}`,
        "",
      ];
    }),
    pc.gray(`Missing runtime fields: ${runtimeStatus.missing.join(", ")}`),
    pc.gray(`Settings will be saved to ${getUserSettingsPath()}`),
    "",
    pc.gray("Use Up/Down to switch providers. Press Enter to continue."),
    pc.gray("Press Esc or Ctrl+C to cancel."),
  ];

  return buildFrame("Connect Your Model Provider", bodyLines, "setup");
}

function buildCredentialsScreen(state: SetupState) {
  const provider = getProviderOption(state.runtime.provider);
  const fieldWidth = Math.max(30, getPanelWidth() - 24);
  const bodyLines = [
    pc.gray(`${provider.label} setup`),
    pc.gray("Fill baseUrl, apiKey, and model. Run Test before Continue."),
    "",
  ];

  const fields: Array<{
    key: keyof SetupState["cursors"];
    label: string;
    placeholder: string;
    secret?: boolean;
  }> = [
    { key: "baseUrl", label: "Base URL", placeholder: provider.defaultBaseUrl },
    { key: "apiKey", label: "API Key", placeholder: "Enter your API key", secret: true },
    { key: "model", label: "Model", placeholder: "Enter your model name" },
  ];

  for (const [index, field] of fields.entries()) {
    const isFocused = state.focus === index;
    const value = state.runtime[field.key];
    const cursor = state.cursors[field.key];
    const label = isFocused ? pc.cyan(field.label.padEnd(8)) : pc.gray(field.label.padEnd(8));
    const fieldValue = buildFieldValue(value, cursor, fieldWidth, field.placeholder, field.secret);

    bodyLines.push(`${label} ${pc.gray("[")}${fieldValue}${pc.gray("]")}`);
    bodyLines.push("");
  }

  const isTestFocused = state.focus === 3;
  const isContinueFocused = state.focus === 4;
  const testButton = isTestFocused ? pc.black(pc.bgCyan(" Test ")) : pc.white(" Test ");
  const continueButton = isContinueFocused
    ? pc.black(pc.bgCyan(" Continue "))
    : pc.white(" Continue ");

  bodyLines.push(`${pc.gray("Actions ")}${testButton}  ${continueButton}`);
  bodyLines.push("");

  if (state.status) {
    const color = getStatusColor(state.status.tone);
    for (const line of wrapText(state.status.message, getPanelWidth() - 6)) {
      bodyLines.push(color(line));
    }
    bodyLines.push("");
  }

  bodyLines.push(pc.gray("Tab / Up / Down moves focus. Left / Right switches buttons or cursor."));
  bodyLines.push(pc.gray("Enter activates the selected field or button. Esc goes back."));

  return buildFrame("Runtime Setup", bodyLines, state.isBusy ? "testing" : "credentials");
}

function renderWizard(state: SetupState) {
  console.clear();
  process.stdout.write("\u001b[?25l");

  const lines = state.step === "provider" ? buildProviderScreen(state) : buildCredentialsScreen(state);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function moveFieldCursor(state: SetupState, direction: -1 | 1) {
  if (state.focus > 2) {
    return;
  }

  const key = state.focus === 0 ? "baseUrl" : state.focus === 1 ? "apiKey" : "model";
  state.cursors[key] = Math.max(0, Math.min(state.runtime[key].length, state.cursors[key] + direction));
}

function mutateActiveField(state: SetupState, updater: (value: string, cursor: number) => { value: string; cursor: number }) {
  if (state.focus > 2) {
    return;
  }

  const key = state.focus === 0 ? "baseUrl" : state.focus === 1 ? "apiKey" : "model";
  const next = updater(state.runtime[key], state.cursors[key]);
  state.runtime[key] = next.value;
  state.cursors[key] = next.cursor;
}

function normalizeFocus(focus: number): FocusTarget {
  if (focus <= 0) return 0;
  if (focus >= 4) return 4;
  return focus as FocusTarget;
}

function syncValidationState(state: SetupState) {
  if (state.lastValidatedKey && state.lastValidatedKey !== getConfigKey(state.runtime)) {
    state.status = {
      tone: "info",
      message: "Configuration changed. Run Test again before continuing.",
    };
  }
}

function validateRuntimeInputs(runtime: PersistedRuntimeSettings) {
  const missing = [];
  if (!runtime.baseUrl.trim()) missing.push("baseUrl");
  if (!runtime.apiKey.trim()) missing.push("apiKey");
  if (!runtime.model.trim()) missing.push("model");
  return missing;
}

export async function runSetupWizard(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const settings = getCliSettings();
  const initialProvider = settings.runtime.provider;
  const initialOption = getProviderOption(initialProvider);

  const state: SetupState = {
    step: "provider",
    providerSelection: getProviderIndex(initialProvider),
    runtime: {
      provider: initialProvider,
      baseUrl: settings.runtime.baseUrl || initialOption.defaultBaseUrl,
      apiKey: settings.runtime.apiKey,
      model: settings.runtime.model,
    },
    focus: 0,
    cursors: {
      baseUrl: (settings.runtime.baseUrl || initialOption.defaultBaseUrl).length,
      apiKey: settings.runtime.apiKey.length,
      model: settings.runtime.model.length,
    },
    buttonSelection: 0,
    status: {
      tone: "info",
      message: "Select a provider, then test your baseUrl, apiKey, and model before starting chat.",
    },
    isBusy: false,
    lastValidatedKey: null,
  };

  return await new Promise<boolean>((resolve) => {
    let finished = false;

    const cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;
      process.stdout.write("\u001b[?25h");
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      console.clear();
    };

    const finish = (result: boolean) => {
      cleanup();
      resolve(result);
    };

    const moveFocus = (direction: -1 | 1) => {
      state.focus = normalizeFocus(state.focus + direction);
      if (state.focus >= 3) {
        state.buttonSelection = state.focus === 3 ? 0 : 1;
      }
    };

    const executeTest = async () => {
      const missing = validateRuntimeInputs(state.runtime);
      if (missing.length > 0) {
        state.status = {
          tone: "error",
          message: `Fill these fields first: ${missing.join(", ")}.`,
        };
        renderWizard(state);
        return;
      }

      state.isBusy = true;
      const provider = getProviderOption(state.runtime.provider);
      state.status = {
        tone: "info",
        message: `Testing ${provider.label} with a hello request...`,
      };
      renderWizard(state);

      try {
        const result = await testRuntimeConnection(state.runtime);
        state.lastValidatedKey = getConfigKey(state.runtime);
        state.status = {
          tone: "success",
          message: `Connection OK. ${result.model} responded from ${result.baseUrl}. Reply preview: ${fitText(result.replyPreview, 80)}`,
        };
      } catch (error) {
        state.lastValidatedKey = null;
        state.status = {
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        state.isBusy = false;
        renderWizard(state);
      }
    };

    const executeContinue = async () => {
      const missing = validateRuntimeInputs(state.runtime);
      if (missing.length > 0) {
        state.status = {
          tone: "error",
          message: `Fill these fields first: ${missing.join(", ")}.`,
        };
        renderWizard(state);
        return;
      }

      if (state.lastValidatedKey !== getConfigKey(state.runtime)) {
        state.status = {
          tone: "error",
          message: "Run Test with the current values before continuing.",
        };
        renderWizard(state);
        return;
      }

      state.isBusy = true;
      state.status = {
        tone: "info",
        message: `Saving runtime settings to ${getUserSettingsPath()}...`,
      };
      renderWizard(state);

      try {
        await saveUserRuntimeSettings(state.runtime);
        finish(true);
      } catch (error) {
        state.isBusy = false;
        state.status = {
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        };
        renderWizard(state);
      }
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if (state.isBusy) {
        return;
      }

      if (key.ctrl && key.name === "c") {
        finish(false);
        return;
      }

      if (state.step === "provider") {
        if (key.name === "up") {
          state.providerSelection =
            state.providerSelection <= 0 ? PROVIDER_OPTIONS.length - 1 : state.providerSelection - 1;
          renderWizard(state);
          return;
        }

        if (key.name === "down" || key.name === "tab") {
          state.providerSelection =
            state.providerSelection >= PROVIDER_OPTIONS.length - 1 ? 0 : state.providerSelection + 1;
          renderWizard(state);
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          const selectedProvider = PROVIDER_OPTIONS[state.providerSelection] ?? PROVIDER_OPTIONS[0]!;

          ensureProviderDefaults(state, selectedProvider.id);
          state.step = "credentials";
          state.focus = 0;
          state.buttonSelection = 0;
          state.status = {
            tone: "info",
            message: `${selectedProvider.label} selected. Fill the fields below, then run Test.`,
          };
          renderWizard(state);
          return;
        }

        if (key.name === "escape") {
          finish(false);
        }

        return;
      }

      if (key.name === "escape") {
        state.step = "provider";
        state.status = {
          tone: "info",
          message: "Choose the provider format you want to configure.",
        };
        renderWizard(state);
        return;
      }

      if (key.name === "tab") {
        moveFocus(key.shift ? -1 : 1);
        renderWizard(state);
        return;
      }

      if (key.name === "up") {
        moveFocus(-1);
        renderWizard(state);
        return;
      }

      if (key.name === "down") {
        moveFocus(1);
        renderWizard(state);
        return;
      }

      if (state.focus >= 3) {
        if (key.name === "left") {
          state.focus = 3;
          state.buttonSelection = 0;
          renderWizard(state);
          return;
        }

        if (key.name === "right") {
          state.focus = 4;
          state.buttonSelection = 1;
          renderWizard(state);
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          if (state.focus === 3) {
            void executeTest();
          } else {
            void executeContinue();
          }
          return;
        }

        return;
      }

      if (key.name === "left") {
        moveFieldCursor(state, -1);
        renderWizard(state);
        return;
      }

      if (key.name === "right") {
        moveFieldCursor(state, 1);
        renderWizard(state);
        return;
      }

      if (key.name === "home") {
        mutateActiveField(state, (value) => ({ value, cursor: 0 }));
        renderWizard(state);
        return;
      }

      if (key.name === "end") {
        mutateActiveField(state, (value) => ({ value, cursor: value.length }));
        renderWizard(state);
        return;
      }

      if (key.name === "backspace") {
        mutateActiveField(state, (value, cursor) => {
          if (cursor <= 0) {
            return { value, cursor };
          }

          return {
            value: `${value.slice(0, cursor - 1)}${value.slice(cursor)}`,
            cursor: cursor - 1,
          };
        });
        syncValidationState(state);
        renderWizard(state);
        return;
      }

      if (key.name === "delete") {
        mutateActiveField(state, (value, cursor) => ({
          value: `${value.slice(0, cursor)}${value.slice(cursor + 1)}`,
          cursor,
        }));
        syncValidationState(state);
        renderWizard(state);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        moveFocus(1);
        renderWizard(state);
        return;
      }

      if (str && !key.ctrl && !key.meta) {
        mutateActiveField(state, (value, cursor) => ({
          value: `${value.slice(0, cursor)}${str}${value.slice(cursor)}`,
          cursor: cursor + str.length,
        }));
        syncValidationState(state);
        renderWizard(state);
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    renderWizard(state);
  });
}
