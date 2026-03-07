import pc from "picocolors";
import type { OrchestratorEvent } from "../agent/orchestrator";
import type { SlashCommandDefinition } from "./commands";

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const BULLET = pc.white("\u2022");

function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

function visibleLength(text: string) {
  return stripAnsi(text).length;
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

function getOutputWidth() {
  const terminalWidth = process.stdout.columns ?? 100;
  return Math.max(72, terminalWidth - 1);
}

function normalizeMessageItems(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const items: string[] = [];
  let currentItem = "";

  for (const rawLine of normalized.split("\n")) {
    if (!rawLine.trim()) {
      if (currentItem) {
        items.push(currentItem.trim());
        currentItem = "";
      }
      continue;
    }

    const bulletMatch = rawLine.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
    const quoteMatch = rawLine.match(/^(\s*>\s+)(.*)$/);

    if (bulletMatch || quoteMatch) {
      if (currentItem) {
        items.push(currentItem.trim());
        currentItem = "";
      }

      const body = (bulletMatch?.[2] ?? quoteMatch?.[2] ?? "").trim();
      items.push(body);
      continue;
    }

    currentItem = currentItem
      ? `${currentItem} ${rawLine.trim()}`
      : rawLine.trim();
  }

  if (currentItem) {
    items.push(currentItem.trim());
  }

  return items;
}

function extractUserQuery(content: string) {
  const match = content.match(/^<user_query>\n?([\s\S]*?)\n?<\/user_query>$/);
  return match?.[1]?.trim() ?? content.trim();
}

function summarizeToolResult(result: string, width: number): string[] {
  const normalized = result.trim();
  if (!normalized) return ["No tool output."];

  const rawLines = normalized.split("\n");
  const previewLines = rawLines.slice(0, 4);
  const lines: string[] = [];

  for (const line of previewLines) {
    lines.push(...wrapPlainText(line, width));
  }

  if (rawLines.length > previewLines.length) {
    lines.push(`... +${rawLines.length - previewLines.length} more line(s)`);
  }

  return lines;
}

function isDiffResult(result: string) {
  const normalized = result.trimStart();
  return normalized.startsWith("--- ") && normalized.includes("\n+++ ");
}

function renderDiffBlock(name: string, result: string) {
  console.log();
  console.log(pc.gray(name));

  for (const line of result.split("\n")) {
    if (line.startsWith("+++ ")) {
      console.log(pc.cyan(line));
      continue;
    }

    if (line.startsWith("--- ")) {
      console.log(pc.gray(line));
      continue;
    }

    if (line.startsWith("@@")) {
      console.log(pc.magenta(line));
      continue;
    }

    if (line.startsWith("+")) {
      console.log(pc.bold(pc.green(line)));
      continue;
    }

    if (line.startsWith("-")) {
      console.log(pc.dim(line));
      continue;
    }

    console.log(pc.white(line));
  }

  console.log();
}

function renderBulletBlock(text: string, width: number) {
  const items = normalizeMessageItems(text);
  if (items.length === 0) return;

  console.log();

  for (const item of items) {
    const wrapped = wrapPlainText(item, Math.max(12, width - 2));
    wrapped.forEach((line, index) => {
      if (index === 0) {
        console.log(`${BULLET} ${line}`);
      } else {
        console.log(`  ${line}`);
      }
    });
    console.log();
  }
}

function renderUserMessage(text: string, width: number) {
  const query = extractUserQuery(text);
  if (!query) return;

  console.log();
  const wrapped = wrapPlainText(query, Math.max(12, width - 2));
  wrapped.forEach((line, index) => {
    if (index === 0) {
      console.log(`${pc.cyan("\u203a")} ${line}`);
    } else {
      console.log(`  ${line}`);
    }
  });
  console.log();
}

function renderToolBlock(name: string, result: string, width: number) {
  if (isDiffResult(result)) {
    renderDiffBlock(name, result);
    return;
  }

  console.log();
  const lines = summarizeToolResult(result, Math.max(12, width - 4));

  if (lines.length === 1) {
    const [line] = lines;
    console.log(`${pc.cyan(name)}: ${line}`);
    console.log();
    return;
  }

  console.log(pc.cyan(name));
  lines.forEach((line) => {
    const wrapped = wrapPlainText(line, Math.max(12, width - 2));
    wrapped.forEach((wrappedLine) => {
      console.log(`  ${wrappedLine}`);
    });
  });

  console.log();
}

function renderDivider(width: number) {
  console.log(pc.gray("\u2500".repeat(width)));
  console.log();
}

function startThinkingIndicator() {
  const animated = Boolean(process.stdout.isTTY);
  const frames = [
    `${pc.gray("THINKING")}${pc.cyan(".   ")}`,
    `${pc.gray("THINKING")}${pc.cyan("..  ")}`,
    `${pc.gray("THINKING")}${pc.cyan("... ")}`,
    `${pc.gray("THINKING")}${pc.cyan("....")}`,
  ];
  let frameIndex = 0;
  let lastFrameLength = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const renderFrame = () => {
    const frame = frames[frameIndex % frames.length]!;
    const frameLength = visibleLength(frame);
    const padding = Math.max(0, lastFrameLength - frameLength);
    process.stdout.write(`\r${frame}${" ".repeat(padding)}`);
    lastFrameLength = frameLength;
    frameIndex = (frameIndex + 1) % frames.length;
  };

  if (animated) {
    renderFrame();
    timer = setInterval(renderFrame, 180);
  } else {
    console.log(pc.gray("THINKING..."));
  }

  return () => {
    if (stopped) return;
    stopped = true;

    if (timer) {
      clearInterval(timer);
    }

    if (animated) {
      process.stdout.write(`\r${" ".repeat(lastFrameLength)}\r`);
    }
  };
}

export function createCliOutputRenderer() {
  let stopThinking = () => {};

  const resetThinking = () => {
    stopThinking();
    stopThinking = () => {};
  };

  return {
    renderEvent(event: OrchestratorEvent) {
      const width = getOutputWidth();

      switch (event.type) {
        case "thinking":
          if (event.phase === "start") {
            resetThinking();
            stopThinking = startThinkingIndicator();
          } else {
            resetThinking();
          }
          break;
        case "assistant-message":
          renderBulletBlock(event.content, width);
          break;
        case "tool-result":
          renderToolBlock(event.name, event.result, width);
          break;
        case "divider":
          renderDivider(width);
          break;
        case "notice":
          resetThinking();
          console.log(pc.yellow(`\n${event.message}\n`));
          break;
        case "error":
          resetThinking();
          console.error(pc.red(`\n${event.message}\n`));
          break;
      }
    },

    renderSlashCommandList(commands: readonly SlashCommandDefinition[]) {
      console.log();
      for (const command of commands) {
        console.log(`${BULLET} ${pc.cyan(command.name)} ${pc.gray("-")} ${command.description}`);
      }
      console.log();
    },

    renderHistory(history: any[]) {
      const width = getOutputWidth();
      let previousRole: string | null = null;

      for (const message of history) {
        if (!message || typeof message !== "object" || message.role === "system") {
          continue;
        }

        if (message.role === "user" && typeof message.content === "string") {
          renderUserMessage(message.content, width);
          previousRole = "user";
          continue;
        }

        if (message.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
          if (previousRole === "tool") {
            renderDivider(width);
          }
          renderBulletBlock(message.content, width);
          previousRole = "assistant";
          continue;
        }

        if (message.role === "tool" && typeof message.content === "string") {
          renderToolBlock(message.name ?? "tool", message.content, width);
          previousRole = "tool";
        }
      }
    },

    renderUnknownCommand(input: string) {
      console.log();
      console.log(`${BULLET} ${pc.red(`Unknown command: ${input}`)}`);
      console.log(pc.gray("  Try /help"));
      console.log();
    },

    dispose() {
      resetThinking();
    },
  };
}
