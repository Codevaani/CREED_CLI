export interface SlashCommandDefinition {
  name: string;
  description: string;
  action: "help" | "clear" | "exit" | "resume";
}

export interface SlashCommandState {
  active: boolean;
  token: string;
  matches: readonly SlashCommandDefinition[];
  exactMatchIndex: number;
}

export interface SlashCommandExecutionContext {
  showCommandList: (commands: readonly SlashCommandDefinition[]) => void;
  clearScreen: () => void;
  exitSession: () => void;
  resumeSession: () => Promise<void>;
}

export type SlashCommandExecutionResult = "handled" | "unknown" | "not-command";

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  { name: "/help", description: "show available commands", action: "help" },
  { name: "/clear", description: "clear the screen", action: "clear" },
  { name: "/resume", description: "pick a saved conversation to resume", action: "resume" },
  { name: "/exit", description: "close the session", action: "exit" },
  { name: "/quit", description: "close the session", action: "exit" },
];

function resolveSlashCommand(token: string) {
  return SLASH_COMMANDS.find((command) => command.name === token);
}

export function getSlashCommandMatches(input: string) {
  const trimmedInput = input.trimStart().toLowerCase();
  if (!trimmedInput.startsWith("/")) return [];

  const query = trimmedInput.split(/\s+/, 1)[0] ?? "";
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(query));
}

export function getSlashCommandState(input: string): SlashCommandState {
  const trimmedInput = input.trimStart();
  if (!trimmedInput.startsWith("/")) {
    return {
      active: false,
      token: "",
      matches: [],
      exactMatchIndex: -1,
    };
  }

  const token = trimmedInput.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  const matches = getSlashCommandMatches(trimmedInput);
  const exactMatchIndex = matches.findIndex((match) => match.name === token);

  return {
    active: true,
    token,
    matches,
    exactMatchIndex,
  };
}

export function normalizeSlashSelection(input: string, selection: number) {
  const state = getSlashCommandState(input);
  if (!state.active || state.matches.length === 0) {
    return -1;
  }

  if (selection >= 0 && selection < state.matches.length) {
    return selection;
  }

  if (state.exactMatchIndex >= 0) {
    return state.exactMatchIndex;
  }

  return 0;
}

export function applySlashCommandSelection(
  input: string,
  command: Pick<SlashCommandDefinition, "name">,
) {
  const leadingWhitespace = input.match(/^\s*/)?.[0] ?? "";
  const trimmedStart = input.slice(leadingWhitespace.length);
  const firstWhitespaceIndex = trimmedStart.search(/\s/);

  if (firstWhitespaceIndex === -1) {
    return `${leadingWhitespace}${command.name}`;
  }

  return `${leadingWhitespace}${command.name}${trimmedStart.slice(firstWhitespaceIndex)}`;
}

export async function executeSlashCommand(
  input: string,
  context: SlashCommandExecutionContext,
): Promise<SlashCommandExecutionResult> {
  const trimmedInput = input.trimStart();
  if (!trimmedInput.startsWith("/")) {
    return "not-command";
  }

  const token = trimmedInput.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  const command = resolveSlashCommand(token);
  if (!command) {
    return "unknown";
  }

  switch (command.action) {
    case "help":
      context.showCommandList(SLASH_COMMANDS);
      break;
    case "clear":
      context.clearScreen();
      break;
    case "resume":
      await context.resumeSession();
      break;
    case "exit":
      context.exitSession();
      break;
  }

  return "handled";
}
