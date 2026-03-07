import readline from "readline";
import pc from "picocolors";
import { execSync } from "child_process";
import { Orchestrator } from "../agent/orchestrator";
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

function renderWelcome(branch: string) {
  console.clear();
  const frameWidth = getFrameWidth();
  const contentWidth = frameWidth;
  const unsafeShellEnabled = process.env.CREED_ENABLE_UNSAFE_COMMAND_TOOL === "1";
  const shellStatus = unsafeShellEnabled
    ? "enabled via CREED_ENABLE_UNSAFE_COMMAND_TOOL=1"
    : "disabled by default";
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

  for (const line of buildKeyValueLines("shell", shellStatus, contentWidth)) {
    console.log(line);
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
  width = getInputFrameWidth(),
) {
  const inner = width - 2;
  const detailLines = resumePicker.visible
    ? buildResumePickerLines(resumePicker, Math.max(12, inner - 2))
    : buildSlashHintLines(input, Math.max(12, inner - 2), selection);
  const rightLabel = resumePicker.visible
    ? pc.gray("resume picker")
    : detailLines.length > 0
      ? pc.gray("command mode")
      : pc.gray("live entry");
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
  options?: { fresh?: boolean; width?: number },
) {
  const width = options?.width ?? getInputFrameWidth();
  const frame = buildInputFrame(input, cursor, selection, resumePicker, width);

  if (hasRenderedInputEditor) {
    clearInputEditor();
  }

  const output = [frame.top, frame.row, ...frame.hintRows, frame.bottom].join("\n");

  process.stdout.write(output);
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

function startInteractiveRepl() {
  const orchestrator = new Orchestrator();
  const output = createCliOutputRenderer();
  const branch = safeGitBranch();
  let currentSessionId = createSessionId();
  let isProcessing = false;
  let currentInput = "";
  let cursor = 0;
  let slashSelection = -1;
  let resumePicker: ResumePickerState = {
    visible: false,
    sessions: [],
    selection: 0,
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

  const renderEditor = (options?: { fresh?: boolean; width?: number }) => {
    syncSlashSelection();
    renderInputEditor(currentInput, cursor, slashSelection, resumePicker, options);
  };

  const persistSession = async () => {
    const history = await orchestrator.getHistorySnapshot();
    await saveSession(currentSessionId, history);
  };

  const renderResumedSession = async (sessionId: string, history: any[]) => {
    currentSessionId = sessionId;
    await orchestrator.restoreHistory(history);
    await saveSession(currentSessionId, history);
    closeResumePicker(true);
    console.clear();
    renderWelcome(branch);
    output.renderHistory(history);
    output.renderEvent({
      type: "notice",
      message: `Resumed session with ${countSessionTurns(history)} user turn(s).`,
    });
  };

  const openResumePicker = async () => {
    const sessions = await listSavedSessions();
    if (sessions.length === 0) {
      output.renderEvent({
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
      output.renderEvent({
        type: "error",
        message: "The selected conversation could not be loaded.",
      });
      renderEditor({ fresh: true });
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

  renderWelcome(branch);
  renderEditor({ fresh: true });

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const closeSession = () => {
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

    const commandResult = await executeSlashCommand(normalizedInput, {
      showCommandList(commands) {
        output.renderSlashCommandList(commands);
        renderEditor({ fresh: true });
      },
      clearScreen() {
        console.clear();
        renderWelcome(branch);
        renderEditor({ fresh: true });
      },
      exitSession() {
        closeSession();
      },
      async resumeSession() {
        await openResumePicker();
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

    if (await handleSlashCommand(normalizedInput)) {
      return;
    }

    moveBelowInputEditor();
    const input = currentInput;
    resetInputState();
    closeResumePicker();
    isProcessing = true;

    try {
      await orchestrator.processUserInput(input, (event) => output.renderEvent(event));
      await persistSession();
    } finally {
      isProcessing = false;
      renderEditor({ fresh: true });
    }
  };

  const onKeypress = async (str: string, key: readline.Key) => {
    if (isProcessing) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      closeSession();
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
  const orchestrator = new Orchestrator();
  const output = createCliOutputRenderer();
  const branch = safeGitBranch();
  let currentSessionId = createSessionId();
  let isProcessing = false;
  let isHandlingLine = false;
  let shouldExitAfterProcessing = false;
  let lineQueue = Promise.resolve();

  renderWelcome(branch);

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

  updatePrompt();
  rl.prompt();

  const handleSlashCommand = (input: string) =>
    executeSlashCommand(input, {
      showCommandList(commands) {
        output.renderSlashCommandList(commands);
      },
      clearScreen() {
        console.clear();
        renderWelcome(branch);
      },
      exitSession() {
        shouldExitAfterProcessing = true;
        rl.close();
      },
      async resumeSession() {
        await resumeLatestSession();
      },
    });

  const finishNonInteractiveSession = () => {
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
