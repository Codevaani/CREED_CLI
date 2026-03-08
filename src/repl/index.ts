import readline from "readline";
import pc from "picocolors";
import { execSync } from "child_process";
import { Orchestrator, type OrchestratorEvent } from "../agent/orchestrator";
import {
  getCliSettings,
  getCliSettingsWarnings,
  saveUserRuntimeSettings,
  type ResolvedCliSettings,
} from "../config/settings";
import { listRuntimeModels, type RuntimeModelOption } from "../runtime/client";
import {
  applySlashCommandSelection,
  executeSlashCommand,
  getSlashCommandState,
  normalizeSlashSelection,
} from "./commands";
import { createCliOutputRenderer } from "./output";
import {
  countSessionTurns,
  createSessionId,
  listSavedSessions,
  loadLatestSession,
  loadSessionById,
  saveSession,
  type StoredSessionSummary,
} from "./session-store";

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const BOX = {
  topLeft: "\u250c",
  topRight: "\u2510",
  bottomLeft: "\u2514",
  bottomRight: "\u2518",
  horizontal: "\u2500",
  vertical: "\u2502",
};

let lastInputFrameHeight = 3;
let hasRenderedInputEditor = false;

interface ResumePickerState {
  visible: boolean;
  sessions: StoredSessionSummary[];
  selection: number;
}

interface ModelPickerState {
  visible: boolean;
  loading: boolean;
  models: RuntimeModelOption[];
  selection: number;
  error: string | null;
}

function safeGitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "no-git";
  }
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function padRightVisible(text: string, width: number): string {
  const padding = Math.max(0, width - visibleLength(text));
  return text + " ".repeat(padding);
}

function fitVisible(text: string, width: number): string {
  const plainText = stripAnsi(text);
  if (plainText.length <= width) return text;
  if (width <= 0) return "";
  if (width <= 3) return ".".repeat(width);
  return plainText.slice(0, width - 3) + "...";
}

function wrapPlainText(text: string, width: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  if (width <= 4) return [normalized.slice(0, width)];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      if (word.length <= width) {
        currentLine = word;
        continue;
      }

      lines.push(word.slice(0, width - 3) + "...");
      continue;
    }

    const nextLine = `${currentLine} ${word}`;
    if (nextLine.length <= width) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);

    if (word.length <= width) {
      currentLine = word;
    } else {
      lines.push(word.slice(0, width - 3) + "...");
      currentLine = "";
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function wrapWithPrefix(prefix: string, text: string, width: number): string[] {
  const availableWidth = Math.max(8, width - prefix.length);
  const wrapped = wrapPlainText(text, availableWidth);

  return wrapped.map((line, index) => {
    const linePrefix = index === 0 ? prefix : " ".repeat(prefix.length);
    return `${linePrefix}${line}`;
  });
}

function getFrameWidth(): number {
  const terminalWidth = process.stdout.columns ?? 100;
  return Math.max(72, Math.min(terminalWidth - 4, 118));
}

function getInputFrameWidth(): number {
  const terminalWidth = process.stdout.columns ?? 100;
  return Math.max(72, terminalWidth - 1);
}

function buildKeyValueLines(label: string, value: string, width: number): string[] {
  const labelWidth = 10;
  const valueWidth = Math.max(12, width - labelWidth - 2);
  const wrappedValue = wrapPlainText(value, valueWidth);

  return wrappedValue.map((line, index) => {
    const prefix = index === 0 ? pc.gray(label.padEnd(labelWidth)) : " ".repeat(labelWidth);
    return `${prefix} ${pc.white(line)}`;
  });
}

function buildSlashHintLines(input: string, width: number, selection: number) {
  const state = getSlashCommandState(input);
  if (!state.active) return [];

  if (state.matches.length === 0) {
    return [{ text: "1. unknown command, try /help", selected: false }];
  }

  const normalizedSelection = normalizeSlashSelection(input, selection);
  return state.matches.flatMap((match, index) =>
    wrapWithPrefix(
      `${index + 1}. `,
      state.matches.length === 1 ? `${match.name} - ${match.description}` : match.name,
      width,
    ).map((textLine, lineIndex) => ({
      text: textLine,
      selected: index === normalizedSelection && lineIndex === 0,
    })),
  );
}

function formatSessionSavedAt(savedAt: string) {
  try {
    return new Date(savedAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return savedAt;
  }
}

function buildResumePickerLines(resumePicker: ResumePickerState, width: number) {
  if (!resumePicker.visible) return [];

  if (resumePicker.sessions.length === 0) {
    return [
      { text: "No saved conversations found.", selected: false },
      { text: "Press Esc to close.", selected: false },
    ];
  }

  const maxVisibleSessions = 6;
  const clampedSelection = Math.max(0, Math.min(resumePicker.selection, resumePicker.sessions.length - 1));
  const windowStart = Math.max(
    0,
    Math.min(
      clampedSelection - Math.floor(maxVisibleSessions / 2),
      Math.max(0, resumePicker.sessions.length - maxVisibleSessions),
    ),
  );
  const visibleSessions = resumePicker.sessions.slice(windowStart, windowStart + maxVisibleSessions);

  const rows = visibleSessions.flatMap((session, index) => {
    const absoluteIndex = windowStart + index;
    const sessionLabel = `${session.preview}  [${session.turnCount} turn${session.turnCount === 1 ? "" : "s"}]  ${formatSessionSavedAt(session.savedAt)}`;

    return wrapWithPrefix(`${absoluteIndex + 1}. `, sessionLabel, width).map((textLine) => ({
      text: textLine,
      selected: absoluteIndex === clampedSelection,
    }));
  });

  if (resumePicker.sessions.length > maxVisibleSessions) {
    rows.push({
      text: `Showing ${windowStart + 1}-${windowStart + visibleSessions.length} of ${resumePicker.sessions.length}`,
      selected: false,
    });
  }

  rows.push({
    text: "Enter to resume  Esc to cancel",
    selected: false,
  });

  return rows;
}

function buildModelPickerLines(modelPicker: ModelPickerState, currentModel: string, width: number) {
  if (!modelPicker.visible) return [];

  if (modelPicker.loading) {
    return [
      { text: "Loading models from the configured provider...", selected: false },
      { text: "Press Esc to cancel.", selected: false },
    ];
  }

  if (modelPicker.error) {
    return [
      { text: modelPicker.error, selected: false },
      { text: "Press Esc to close.", selected: false },
    ];
  }

  if (modelPicker.models.length === 0) {
    return [
      { text: "No models were returned by the current provider.", selected: false },
      { text: "Press Esc to close.", selected: false },
    ];
  }

  const maxVisibleModels = 8;
  const clampedSelection = Math.max(0, Math.min(modelPicker.selection, modelPicker.models.length - 1));
  const windowStart = Math.max(
    0,
    Math.min(
      clampedSelection - Math.floor(maxVisibleModels / 2),
      Math.max(0, modelPicker.models.length - maxVisibleModels),
    ),
  );
  const visibleModels = modelPicker.models.slice(windowStart, windowStart + maxVisibleModels);
  const rows = visibleModels.flatMap((model, index) => {
    const absoluteIndex = windowStart + index;
    const isCurrent = model.id === currentModel;
    const displayLabel = model.label !== model.id ? `${model.label}` : model.id;
    const label = isCurrent ? `${displayLabel}  [current]` : displayLabel;

    return wrapWithPrefix(`${absoluteIndex + 1}. `, label, width).map((textLine) => ({
      text: textLine,
      selected: absoluteIndex === clampedSelection,
    }));
  });

  if (modelPicker.models.length > maxVisibleModels) {
    rows.push({
      text: `Showing ${windowStart + 1}-${windowStart + visibleModels.length} of ${modelPicker.models.length}`,
      selected: false,
    });
  }

  rows.push({
    text: "Enter to switch  Esc to cancel",
    selected: false,
  });

  return rows;
}

function renderWelcome(branch: string, settings: ResolvedCliSettings) {
  console.clear();
  const frameWidth = getFrameWidth();
  const contentWidth = frameWidth;
  const shellStatus = settings.shell.enableUnsafeCommands ? "enabled for this session" : "disabled by default";
  const headerText = `${pc.bold(pc.cyan("creed-cli"))} ${pc.gray("\u00b7")} ${pc.gray("natural language coding")}`;
  console.log(headerText);

  console.log();

  for (const line of wrapPlainText(
    "Read the repo, explain code, patch files, and keep changes scoped to this workspace.",
    contentWidth,
  )) {
    console.log(pc.gray(line));
  }

  console.log();

  for (const line of buildKeyValueLines("workspace", process.cwd(), contentWidth)) {
    console.log(line);
  }

  for (const line of buildKeyValueLines("branch", branch, contentWidth)) {
    console.log(line);
  }

  if (settings.ui.showShellStatusLine) {
    for (const line of buildKeyValueLines("shell", shellStatus, contentWidth)) {
      console.log(line);
    }
  }

  console.log();

  for (const line of wrapPlainText(
    "You can ask for walkthroughs, bug fixes, new files, refactors, or precise edits.",
    contentWidth,
  )) {
    console.log(pc.gray(line));
  }

  console.log();
}

function buildInputFrame(
  input: string,
  cursor: number,
  selection: number,
  resumePicker: ResumePickerState,
  modelPicker: ModelPickerState,
  currentModel: string,
  statusLabel?: string,
  width = getInputFrameWidth(),
) {
  const inner = width - 2;
  const detailLines = modelPicker.visible
    ? buildModelPickerLines(modelPicker, currentModel, Math.max(12, inner - 2))
    : resumePicker.visible
      ? buildResumePickerLines(resumePicker, Math.max(12, inner - 2))
      : buildSlashHintLines(input, Math.max(12, inner - 2), selection);
  const rightLabel = modelPicker.visible
    ? pc.gray(modelPicker.loading ? "loading models" : "model picker")
    : resumePicker.visible
      ? pc.gray("resume picker")
    : detailLines.length > 0
      ? pc.gray("command mode")
      : statusLabel ?? pc.gray("live entry");
  const rightText = ` ${fitVisible(rightLabel, Math.max(10, inner - 8))} `;
  const filler = BOX.horizontal.repeat(
    Math.max(1, inner - 1 - visibleLength(rightText)),
  );
  const prefix = `${pc.cyan("\u203a")} `;
  const editableWidth = Math.max(10, inner - 1 - visibleLength(prefix));
  let viewStart = Math.max(0, cursor - editableWidth + 1);

  if (input.length - viewStart < editableWidth) {
    viewStart = Math.max(0, input.length - editableWidth);
  }

  const visibleInput = input.slice(viewStart, viewStart + editableWidth);
  const rowContent = padRightVisible(` ${prefix}${visibleInput}`, inner);
  const hintRows = detailLines.map((hintLine) =>
    pc.gray(BOX.vertical) +
    pc.reset(
      padRightVisible(
        ` ${fitVisible(
          hintLine.selected ? pc.black(pc.bgCyan(hintLine.text)) : pc.gray(hintLine.text),
          inner - 1,
        )}`,
        inner,
      ),
    ) +
    pc.gray(BOX.vertical),
  );
  const height = 3 + hintRows.length;

  return {
    top: pc.gray(
      `${BOX.topLeft}${BOX.horizontal}${filler}${rightText}${BOX.topRight}`,
    ),
    row: pc.gray(BOX.vertical) + pc.reset(rowContent) + pc.gray(BOX.vertical),
    hintRows,
    bottom: pc.gray(`${BOX.bottomLeft}${BOX.horizontal.repeat(inner)}${BOX.bottomRight}`),
    cursorColumn: 2 + visibleLength(prefix) + Math.max(0, cursor - viewStart),
    height,
  };
}

function renderInputEditor(
  input: string,
  cursor: number,
  selection: number,
  resumePicker: ResumePickerState,
  modelPicker: ModelPickerState,
  currentModel: string,
  statusLabel?: string,
  options?: { fresh?: boolean; width?: number },
) {
  const width = options?.width ?? getInputFrameWidth();
  const frame = buildInputFrame(
    input,
    cursor,
    selection,
    resumePicker,
    modelPicker,
    currentModel,
    statusLabel,
    width,
  );
  const frameLines = [frame.top, frame.row, ...frame.hintRows, frame.bottom];

  if (hasRenderedInputEditor && lastInputFrameHeight === frame.height) {
    readline.cursorTo(process.stdout, 0);
    readline.moveCursor(process.stdout, 0, -1);

    for (let index = 0; index < frameLines.length; index += 1) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(frameLines[index]!);

      if (index < frameLines.length - 1) {
        process.stdout.write("\n");
      }
    }
  } else if (hasRenderedInputEditor) {
    clearInputEditor();
  }

  if (!hasRenderedInputEditor) {
    process.stdout.write(frameLines.join("\n"));
  }

  readline.moveCursor(process.stdout, 0, -(frame.height - 2));
  readline.cursorTo(process.stdout, frame.cursorColumn);
  lastInputFrameHeight = frame.height;
  hasRenderedInputEditor = true;
}

function clearInputEditor() {
  if (!hasRenderedInputEditor) {
    return;
  }

  readline.cursorTo(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, -1);
  readline.clearScreenDown(process.stdout);
  hasRenderedInputEditor = false;
}

function moveBelowInputEditor() {
  readline.cursorTo(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, Math.max(1, lastInputFrameHeight - 2));
  process.stdout.write("\n");
}

function getStableThinkingFrame(index: number) {
  const frames = ["thinking   ", "thinking.  ", "thinking.. ", "thinking..."];
  return frames[index % frames.length] ?? frames[0]!;
}

function renderStartupWarnings(warnings: readonly string[]) {
  for (const warning of warnings) {
    console.log(pc.yellow(warning));
  }

  if (warnings.length > 0) {
    console.log();
  }
}

function startInteractiveRepl() {
  const settings = getCliSettings();
  const settingsWarnings = getCliSettingsWarnings();
  const orchestrator = new Orchestrator();
  const output = createCliOutputRenderer({ animateThinking: false });
  const branch = safeGitBranch();
  let currentSessionId = createSessionId();
  let isProcessing = false;
  let isThinking = false;
  let currentInput = "";
  let cursor = 0;
  let slashSelection = -1;
  let pendingInputs: string[] = [];
  let thinkingFrameIndex = 0;
  let thinkingTimer: ReturnType<typeof setInterval> | undefined;
  let lastInputActivityAt = 0;
  let pendingCtrlCExit = false;
  let ctrlCExitTimer: ReturnType<typeof setTimeout> | undefined;
  let sessionClosed = false;
  let resumePicker: ResumePickerState = {
    visible: false,
    sessions: [],
    selection: 0,
  };
  let modelPicker: ModelPickerState = {
    visible: false,
    loading: false,
    models: [],
    selection: 0,
    error: null,
  };

  const syncSlashSelection = () => {
    slashSelection = normalizeSlashSelection(currentInput, slashSelection);
  };

  const resetInputState = () => {
    currentInput = "";
    cursor = 0;
    slashSelection = -1;
  };

  const closeResumePicker = (clearInput = false) => {
    resumePicker = {
      visible: false,
      sessions: [],
      selection: 0,
    };

    if (clearInput) {
      resetInputState();
    }
  };

  const closeModelPicker = (clearInput = false) => {
    modelPicker = {
      visible: false,
      loading: false,
      models: [],
      selection: 0,
      error: null,
    };

    if (clearInput) {
      resetInputState();
    }
  };

  const getStatusDisplayLabel = () => {
    const queuedLabel =
      pendingInputs.length > 0 ? pc.gray(` | ${pendingInputs.length} queued`) : "";

    if (isThinking) {
      return `${pc.cyan(getStableThinkingFrame(thinkingFrameIndex))}${queuedLabel}`;
    }

    if (isProcessing) {
      return `${pc.cyan("working    ")}${queuedLabel}`;
    }

    return undefined;
  };


  const renderEditor = (options?: { fresh?: boolean; width?: number }) => {
    syncSlashSelection();
    renderInputEditor(
      currentInput,
      cursor,
      slashSelection,
      resumePicker,
      modelPicker,
      settings.runtime.model,
      getStatusDisplayLabel(),
      options,
    );
  };

  const clearCtrlCExitState = () => {
    pendingCtrlCExit = false;

    if (ctrlCExitTimer) {
      clearTimeout(ctrlCExitTimer);
      ctrlCExitTimer = undefined;
    }
  };

  const armCtrlCToExit = () => {
    pendingCtrlCExit = true;

    if (ctrlCExitTimer) {
      clearTimeout(ctrlCExitTimer);
    }

    ctrlCExitTimer = setTimeout(() => {
      pendingCtrlCExit = false;
      ctrlCExitTimer = undefined;
    }, settings.ui.ctrlCConfirmTimeoutMs);
  };

  const stopThinkingStatus = () => {
    isThinking = false;
    thinkingFrameIndex = 0;

    if (thinkingTimer) {
      clearInterval(thinkingTimer);
      thinkingTimer = undefined;
    }
  };

  const startThinkingStatus = () => {
    isThinking = true;

    if (thinkingTimer) {
      return;
    }

    thinkingFrameIndex = 0;
    thinkingTimer = setInterval(() => {
      if (Date.now() - lastInputActivityAt < 220) {
        return;
      }

      thinkingFrameIndex = (thinkingFrameIndex + 1) % 4;

      if (!sessionClosed && hasRenderedInputEditor) {
        renderEditor();
      }
    }, 180);
  };

  const renderOutputEvent = (event: OrchestratorEvent) => {
    if (event.type === "thinking") {
      if (event.phase === "start") {
        startThinkingStatus();
      } else {
        stopThinkingStatus();
      }

      if (!sessionClosed) {
        renderEditor();
      }

      return;
    }

    clearInputEditor();
    output.renderEvent(event);

    if (!sessionClosed) {
      renderEditor({ fresh: true });
    }
  };

  const renderSubmittedInput = (input: string) => {
    clearInputEditor();
    output.renderUserInput(input);

    if (!sessionClosed) {
      renderEditor({ fresh: true });
    }
  };

  const persistSession = async () => {
    const history = await orchestrator.getHistorySnapshot();
    await saveSession(currentSessionId, history);
  };

  const renderResumedSession = async (sessionId: string, history: any[]) => {
    stopThinkingStatus();
    pendingInputs = [];
    isProcessing = false;
    currentSessionId = sessionId;
    await orchestrator.restoreHistory(history);
    await saveSession(currentSessionId, history);
    closeResumePicker(true);
    console.clear();
    renderWelcome(branch, settings);
    output.renderHistory(history);
    renderOutputEvent({
      type: "notice",
      message: `Resumed session with ${countSessionTurns(history)} user turn(s).`,
    });
  };

  const openResumePicker = async () => {
    closeModelPicker();
    const sessions = await listSavedSessions();
    if (sessions.length === 0) {
      renderOutputEvent({
        type: "notice",
        message: "No saved session found yet. Start a conversation first.",
      });
      return;
    }

    currentInput = "";
    cursor = 0;
    slashSelection = -1;
    resumePicker = {
      visible: true,
      sessions,
      selection: 0,
    };
  };

  const openModelPicker = async () => {
    closeResumePicker();
    currentInput = "";
    cursor = 0;
    slashSelection = -1;
    modelPicker = {
      visible: true,
      loading: true,
      models: [],
      selection: 0,
      error: null,
    };
    renderEditor({ fresh: true });

    try {
      const runtimeConfig = orchestrator.getRuntimeConfig();
      const models = await listRuntimeModels(runtimeConfig);
      const currentModelIndex = models.findIndex((model) => model.id === runtimeConfig.model);

      modelPicker = {
        visible: true,
        loading: false,
        models,
        selection: currentModelIndex >= 0 ? currentModelIndex : 0,
        error: models.length === 0 ? "No models were returned by the current provider." : null,
      };
    } catch (error) {
      modelPicker = {
        visible: true,
        loading: false,
        models: [],
        selection: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    renderEditor({ fresh: true });
  };

  const applySelectedModel = async (model: RuntimeModelOption) => {
    const runtimeConfig = orchestrator.getRuntimeConfig();
    const nextRuntime = {
      ...runtimeConfig,
      model: model.id,
    };

    await saveUserRuntimeSettings(nextRuntime);
    orchestrator.setRuntimeModel(model.id);
    settings.runtime.model = model.id;
    closeModelPicker(true);
    renderOutputEvent({
      type: "notice",
      message: `Active model switched to ${model.id}.`,
    });
  };

  const selectModelByQuery = async (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      await openModelPicker();
      return;
    }

    const models = await listRuntimeModels(orchestrator.getRuntimeConfig());
    if (models.length === 0) {
      renderOutputEvent({
        type: "notice",
        message: "No models were returned by the current provider.",
      });
      return;
    }

    const exactMatch = models.find((model) => model.id.toLowerCase() === normalizedQuery.toLowerCase());
    if (exactMatch) {
      await applySelectedModel(exactMatch);
      return;
    }

    const partialMatches = models.filter((model) =>
      model.id.toLowerCase().includes(normalizedQuery.toLowerCase()),
    );

    if (partialMatches.length === 1) {
      await applySelectedModel(partialMatches[0]!);
      return;
    }

    if (partialMatches.length > 1) {
      renderOutputEvent({
        type: "notice",
        message: `Multiple models matched "${normalizedQuery}". Use /model and pick one from the list.`,
      });
      return;
    }

    renderOutputEvent({
      type: "notice",
      message: `No model matched "${normalizedQuery}". Use /model to browse available models.`,
    });
  };

  const selectCurrentModelFromPicker = async () => {
    if (!modelPicker.visible || modelPicker.loading || modelPicker.models.length === 0) {
      closeModelPicker(true);
      renderEditor({ fresh: true });
      return;
    }

    const selectedModel = modelPicker.models[modelPicker.selection];
    if (!selectedModel) {
      return;
    }

    await applySelectedModel(selectedModel);
    renderEditor({ fresh: true });
  };

  const resumeSelectedSession = async () => {
    if (!resumePicker.visible || resumePicker.sessions.length === 0) {
      closeResumePicker(true);
      renderEditor({ fresh: true });
      return;
    }

    const selectedSession = resumePicker.sessions[resumePicker.selection];
    if (!selectedSession) {
      return;
    }

    const storedSession = await loadSessionById(selectedSession.id);
    if (!storedSession) {
      closeResumePicker(true);
      renderOutputEvent({
        type: "error",
        message: "The selected conversation could not be loaded.",
      });
      return;
    }

    await renderResumedSession(storedSession.id, storedSession.history);
    renderEditor({ fresh: true });
  };

  const completeSlashCommand = (direction: 1 | -1 = 1) => {
    const slashState = getSlashCommandState(currentInput);
    if (!slashState.active || slashState.matches.length === 0) {
      return false;
    }

    let nextSelection = normalizeSlashSelection(currentInput, slashSelection);
    const currentMatch = slashState.matches[nextSelection];
    if (!currentMatch) {
      return false;
    }

    const shouldCycle =
      slashState.matches.length > 1 &&
      slashState.token === currentMatch.name;

    if (shouldCycle) {
      nextSelection = direction === 1
        ? (nextSelection + 1) % slashState.matches.length
        : (nextSelection <= 0 ? slashState.matches.length - 1 : nextSelection - 1);
    }

    const nextMatch = slashState.matches[nextSelection];
    if (!nextMatch) {
      return false;
    }

    currentInput = applySlashCommandSelection(currentInput, nextMatch);
    cursor = currentInput.length;
    slashSelection = nextSelection;
    renderEditor();
    return true;
  };

  const processPendingInputs = async () => {
    if (sessionClosed || isProcessing || pendingInputs.length === 0) {
      if (!sessionClosed) {
        renderEditor();
      }
      return;
    }

    const nextInput = pendingInputs.shift();
    if (!nextInput) {
      renderEditor();
      return;
    }

    isProcessing = true;
    renderEditor();

    try {
      await orchestrator.processUserInput(nextInput, renderOutputEvent);
      await persistSession();
    } finally {
      isProcessing = false;
      stopThinkingStatus();

      if (!sessionClosed) {
        renderEditor({ fresh: true });
      }
    }

    if (pendingInputs.length > 0 && !sessionClosed) {
      void processPendingInputs();
    }
  };

  renderWelcome(branch, settings);
  renderStartupWarnings(settingsWarnings);
  renderEditor({ fresh: true });

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const closeSession = () => {
    sessionClosed = true;
    clearCtrlCExitState();
    stopThinkingStatus();
    clearInputEditor();
    output.dispose();
    process.stdin.setRawMode(false);
    process.stdin.removeListener("keypress", onKeypress);
    console.log(pc.yellow("Goodbye!"));
    process.exit(0);
  };

  const handleSlashCommand = async (normalizedInput: string) => {
    if (!normalizedInput.startsWith("/")) {
      return false;
    }

    clearInputEditor();
    resetInputState();
    closeResumePicker();
    closeModelPicker();

    const commandResult = await executeSlashCommand(normalizedInput, {
      showCommandList(commands) {
        output.renderSlashCommandList(commands);
        renderEditor({ fresh: true });
      },
      clearScreen() {
        console.clear();
        renderWelcome(branch, settings);
        renderEditor({ fresh: true });
      },
      exitSession() {
        closeSession();
      },
      async resumeSession() {
        await openResumePicker();
        renderEditor({ fresh: true });
      },
      async selectModel(input) {
        const query = input.replace(/^\/model\b/i, "").trim();
        try {
          await selectModelByQuery(query);
        } catch (error) {
          renderOutputEvent({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        renderEditor({ fresh: true });
      },
    });

    if (commandResult === "handled") {
      return true;
    }

    if (commandResult === "unknown") {
      output.renderUnknownCommand(normalizedInput);
      renderEditor({ fresh: true });
      return true;
    }

    return false;
  };

  const submitInput = async () => {
    if (resumePicker.visible) {
      await resumeSelectedSession();
      return;
    }

    const normalizedInput = currentInput.trim();

    if (!normalizedInput) {
      renderEditor();
      return;
    }

    const slashState = getSlashCommandState(currentInput);
    const selectedCommand =
      slashState.matches[normalizeSlashSelection(currentInput, slashSelection)] ?? null;

    if (
      slashState.active &&
      selectedCommand &&
      slashState.token !== selectedCommand.name &&
      !/\s/.test(slashState.token)
    ) {
      currentInput = applySlashCommandSelection(currentInput, selectedCommand);
      cursor = currentInput.length;
      slashSelection = normalizeSlashSelection(currentInput, slashSelection);
      renderEditor();
      return;
    }

    const slashToken = normalizedInput.trimStart().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
    if (
      normalizedInput.startsWith("/") &&
      isProcessing &&
      slashToken !== "/exit" &&
      slashToken !== "/quit"
    ) {
      renderOutputEvent({
        type: "notice",
        message: "Wait for the current response before using /help, /clear, /resume, or /model.",
      });
      return;
    }

    if (await handleSlashCommand(normalizedInput)) {
      return;
    }

    const input = currentInput;
    resetInputState();
    closeResumePicker();
    renderSubmittedInput(input);
    pendingInputs.push(input);
    renderEditor({ fresh: true });
    void processPendingInputs();
  };

  const onKeypress = async (str: string, key: readline.Key) => {
    if (key.ctrl && key.name === "c") {
      if (pendingCtrlCExit) {
        closeSession();
        return;
      }

      armCtrlCToExit();
      renderOutputEvent({
        type: "notice",
        message: "Press Ctrl+C again to close.",
      });
      return;
    }

    if (pendingCtrlCExit) {
      clearCtrlCExitState();
    }

    lastInputActivityAt = Date.now();

    if (modelPicker.visible) {
      if (key.name === "up" || (key.shift && key.name === "tab")) {
        const modelCount = modelPicker.models.length;
        if (modelCount > 0) {
          modelPicker = {
            ...modelPicker,
            selection: modelPicker.selection <= 0 ? modelCount - 1 : modelPicker.selection - 1,
          };
          renderEditor();
        }
        return;
      }

      if (key.name === "down" || key.name === "tab") {
        const modelCount = modelPicker.models.length;
        if (modelCount > 0) {
          modelPicker = {
            ...modelPicker,
            selection: modelPicker.selection >= modelCount - 1 ? 0 : modelPicker.selection + 1,
          };
          renderEditor();
        }
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        await selectCurrentModelFromPicker();
        return;
      }

      if (key.name === "escape" || key.name === "backspace" || (key.ctrl && key.name === "u")) {
        closeModelPicker(true);
        renderEditor({ fresh: true });
        return;
      }

      return;
    }

    if (resumePicker.visible) {
      if (key.name === "up" || (key.shift && key.name === "tab")) {
        const sessionCount = resumePicker.sessions.length;
        if (sessionCount > 0) {
          resumePicker = {
            ...resumePicker,
            selection: resumePicker.selection <= 0 ? sessionCount - 1 : resumePicker.selection - 1,
          };
          renderEditor();
        }
        return;
      }

      if (key.name === "down" || key.name === "tab") {
        const sessionCount = resumePicker.sessions.length;
        if (sessionCount > 0) {
          resumePicker = {
            ...resumePicker,
            selection: resumePicker.selection >= sessionCount - 1 ? 0 : resumePicker.selection + 1,
          };
          renderEditor();
        }
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        await resumeSelectedSession();
        return;
      }

      if (key.name === "escape" || key.name === "backspace" || (key.ctrl && key.name === "u")) {
        closeResumePicker(true);
        renderEditor({ fresh: true });
        return;
      }

      return;
    }

    if (key.name === "tab") {
      completeSlashCommand(key.shift ? -1 : 1);
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      await submitInput();
      return;
    }

    if (key.name === "backspace") {
      if (cursor > 0) {
        currentInput = currentInput.slice(0, cursor - 1) + currentInput.slice(cursor);
        cursor -= 1;
      }
      renderEditor();
      return;
    }

    if (key.name === "delete") {
      currentInput = currentInput.slice(0, cursor) + currentInput.slice(cursor + 1);
      renderEditor();
      return;
    }

    if (key.name === "left") {
      cursor = Math.max(0, cursor - 1);
      renderEditor();
      return;
    }

    if (key.name === "right") {
      cursor = Math.min(currentInput.length, cursor + 1);
      renderEditor();
      return;
    }

    if (key.name === "up") {
      const slashState = getSlashCommandState(currentInput);
      if (slashState.active && slashState.matches.length > 0) {
        const currentSelection = normalizeSlashSelection(currentInput, slashSelection);
        slashSelection =
          currentSelection <= 0 ? slashState.matches.length - 1 : currentSelection - 1;
        renderEditor();
      }
      return;
    }

    if (key.name === "down") {
      const slashState = getSlashCommandState(currentInput);
      if (slashState.active && slashState.matches.length > 0) {
        const currentSelection = normalizeSlashSelection(currentInput, slashSelection);
        slashSelection =
          currentSelection >= slashState.matches.length - 1 ? 0 : currentSelection + 1;
        renderEditor();
      }
      return;
    }

    if (key.name === "home") {
      cursor = 0;
      renderEditor();
      return;
    }

    if (key.name === "end") {
      cursor = currentInput.length;
      renderEditor();
      return;
    }

    if (key.ctrl && key.name === "u") {
      resetInputState();
      renderEditor();
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      currentInput = currentInput.slice(0, cursor) + str + currentInput.slice(cursor);
      cursor += str.length;
      renderEditor();
    }
  };

  process.stdin.on("keypress", onKeypress);
}

function startNonInteractiveRepl() {
  const settings = getCliSettings();
  const settingsWarnings = getCliSettingsWarnings();
  const orchestrator = new Orchestrator();
  const output = createCliOutputRenderer({
    animateThinking: settings.ui.animateNonInteractiveThinking,
  });
  const branch = safeGitBranch();
  let currentSessionId = createSessionId();
  let isProcessing = false;
  let isHandlingLine = false;
  let shouldExitAfterProcessing = false;
  let lineQueue = Promise.resolve();
  let pendingSigintExit = false;
  let sigintExitTimer: ReturnType<typeof setTimeout> | undefined;

  renderWelcome(branch, settings);
  renderStartupWarnings(settingsWarnings);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const updatePrompt = () => {
    rl.setPrompt(pc.cyan("\u203a "));
  };

  const persistSession = async () => {
    const history = await orchestrator.getHistorySnapshot();
    await saveSession(currentSessionId, history);
  };

  const resumeLatestSession = async () => {
    const savedSession = await loadLatestSession();
    if (!savedSession) {
      output.renderEvent({
        type: "notice",
        message: "No saved session found yet. Start a conversation first.",
      });
      return;
    }

    currentSessionId = savedSession.id;
    await orchestrator.restoreHistory(savedSession.history);
    await saveSession(currentSessionId, savedSession.history);
    output.renderHistory(savedSession.history);
    output.renderEvent({
      type: "notice",
      message: `Resumed latest session with ${countSessionTurns(savedSession.history)} user turn(s).`,
    });
  };

  const listAvailableModels = async () => {
    const runtimeConfig = orchestrator.getRuntimeConfig();
    const models = await listRuntimeModels(runtimeConfig);
    if (models.length === 0) {
      output.renderEvent({
        type: "notice",
        message: "No models were returned by the current provider.",
      });
      return;
    }

    output.renderModelList(models, runtimeConfig.model);
  };

  const switchModelFromCommand = async (input: string) => {
    const query = input.replace(/^\/model\b/i, "").trim();
    if (!query) {
      await listAvailableModels();
      return;
    }

    const models = await listRuntimeModels(orchestrator.getRuntimeConfig());
    const exactMatch = models.find((model) => model.id.toLowerCase() === query.toLowerCase());
    const partialMatches = models.filter((model) => model.id.toLowerCase().includes(query.toLowerCase()));
    const selectedModel = exactMatch ?? (partialMatches.length === 1 ? partialMatches[0] : null);

    if (!selectedModel) {
      output.renderEvent({
        type: "notice",
        message:
          partialMatches.length > 1
            ? `Multiple models matched "${query}". Use /model to list and choose one exact id.`
            : `No model matched "${query}". Use /model to list available models.`,
      });
      return;
    }

    const nextRuntime = {
      ...orchestrator.getRuntimeConfig(),
      model: selectedModel.id,
    };

    await saveUserRuntimeSettings(nextRuntime);
    orchestrator.setRuntimeModel(selectedModel.id);
    settings.runtime.model = selectedModel.id;
    output.renderEvent({
      type: "notice",
      message: `Active model switched to ${selectedModel.id}.`,
    });
  };

  updatePrompt();
  rl.prompt();

  const handleSlashCommand = (input: string) =>
    executeSlashCommand(input, {
      showCommandList(commands) {
        output.renderSlashCommandList(commands);
      },
      clearScreen() {
        console.clear();
        renderWelcome(branch, settings);
      },
      exitSession() {
        shouldExitAfterProcessing = true;
        rl.close();
      },
      async resumeSession() {
        await resumeLatestSession();
      },
      async selectModel(input) {
        await switchModelFromCommand(input);
      },
    });

  const finishNonInteractiveSession = () => {
    pendingSigintExit = false;
    if (sigintExitTimer) {
      clearTimeout(sigintExitTimer);
      sigintExitTimer = undefined;
    }
    output.dispose();
    console.log(pc.yellow("Goodbye!"));
    process.exit(0);
  };

  const processLine = async (line: string) => {
    isHandlingLine = true;
    const input = line.trim();

    if (input === "exit" || input === "quit") {
      shouldExitAfterProcessing = true;
      rl.close();
      isHandlingLine = false;
      return;
    }

    const commandResult = await handleSlashCommand(input);
    if (commandResult === "handled") {
      isHandlingLine = false;
      if (!shouldExitAfterProcessing) {
        updatePrompt();
        rl.prompt();
      }
      return;
    }

    if (commandResult === "unknown") {
      output.renderUnknownCommand(input);
      isHandlingLine = false;
      updatePrompt();
      rl.prompt();
      return;
    }

    if (input) {
      isProcessing = true;
      try {
        await orchestrator.processUserInput(input, (event) => output.renderEvent(event));
        await persistSession();
      } finally {
        isProcessing = false;
      }
    }

    isHandlingLine = false;

    if (shouldExitAfterProcessing) {
      finishNonInteractiveSession();
    }

    updatePrompt();
    rl.prompt();
  };

  rl.on("line", (line) => {
    pendingSigintExit = false;
    if (sigintExitTimer) {
      clearTimeout(sigintExitTimer);
      sigintExitTimer = undefined;
    }

    lineQueue = lineQueue
      .then(() => processLine(line))
      .catch((error) => {
        isHandlingLine = false;
        output.renderEvent({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });

        if (shouldExitAfterProcessing) {
          finishNonInteractiveSession();
          return;
        }

        updatePrompt();
        rl.prompt();
      });
  }).on("SIGINT", () => {
    if (pendingSigintExit) {
      shouldExitAfterProcessing = false;
      rl.close();
      return;
    }

    pendingSigintExit = true;
    console.log(pc.yellow("\nPress Ctrl+C again to close.\n"));
    updatePrompt();
    rl.prompt();

    if (sigintExitTimer) {
      clearTimeout(sigintExitTimer);
    }

    sigintExitTimer = setTimeout(() => {
      pendingSigintExit = false;
      sigintExitTimer = undefined;
    }, settings.ui.ctrlCConfirmTimeoutMs);
  }).on("close", () => {
    if (isProcessing || isHandlingLine) {
      shouldExitAfterProcessing = true;
      return;
    }

    finishNonInteractiveSession();
  });
}

export function startRepl() {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    startInteractiveRepl();
    return;
  }

  startNonInteractiveRepl();
}
