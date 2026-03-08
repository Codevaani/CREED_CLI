import { Command } from "commander";
import pc from "picocolors";
import { Orchestrator } from "./agent/orchestrator";
import {
  clearUserRuntimeSettings,
  getCliSettings,
  getCliSettingsSources,
  getCliSettingsWarnings,
  getRuntimeSettingsStatus,
  getUserMcpPath,
  getUserSettingsPath,
  removeUserMcpServer,
  saveUserMcpServer,
  type McpServerConfig,
} from "./config/settings";
import { clearMcpCache, getMcpServerStatuses, listMcpToolsForServer } from "./mcp";
import { startRepl, type StartReplOptions } from "./repl";
import { createCliOutputRenderer } from "./repl/output";
import { createSessionId, saveSession } from "./repl/session-store";
import { runSetupWizard } from "./setup/wizard";

function collectOptionValue(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}

function validateMcpServerName(name: string) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

function parseMcpEnvEntries(entries: string[]) {
  const env: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env entry "${entry}". Use KEY=VALUE.`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1);

    if (!key) {
      throw new Error(`Invalid env entry "${entry}". Use KEY=VALUE.`);
    }

    env[key] = value;
  }

  return env;
}

function validateMcpLaunchInput(name: string, command: string, args: string[]) {
  const normalizedCommand = command.trim().toLowerCase();
  if (!["npx", "npx.cmd"].includes(normalizedCommand)) {
    return;
  }

  const hasPackageOrCommand = args.some((arg) => !arg.trim().startsWith("-"));
  if (hasPackageOrCommand) {
    return;
  }

  throw new Error(
    `The MCP server "${name}" is missing the package or command argument for npx. ` +
    `Example: creed-cli mcp add ${name} npx -y @modelcontextprotocol/server-github`
  );
}

function exitWithMissingRuntimeConfig() {
  const runtimeStatus = getRuntimeSettingsStatus();
  if (runtimeStatus.isConfigured) {
    return false;
  }

  const configuredSources = getCliSettingsSources();
  const settingsSourceSummary =
    configuredSources.length > 0
      ? configuredSources.join(", ")
      : "No settings file detected yet.";

  console.error();
  console.error(pc.red("Missing required runtime configuration."));
  console.error(pc.gray(`Missing: ${runtimeStatus.missing.join(", ")}`));
  console.error(pc.gray(`Detected settings sources: ${settingsSourceSummary}`));
  console.error();
  console.error(pc.white("Set these before running `creed-cli chat`:"));
  console.error(pc.gray("1. workspace file: .creed/settings.json"));
  console.error(pc.gray(`2. user file: ${getUserSettingsPath()}`));
  console.error(pc.gray("3. or env vars: CREED_BASE_URL, CREED_API_KEY, CREED_MODEL"));
  console.error();
  console.error(pc.white("Example `.creed/settings.json`:"));
  console.error(
    pc.gray(
      [
        "{",
        '  "runtime": {',
        '    "baseUrl": "http://localhost:20128/v1",',
        '    "apiKey": "your-api-key",',
        '    "model": "your-model-name"',
        "  }",
        "}",
      ].join("\n"),
    ),
  );
  console.error();
  process.exitCode = 1;
  return true;
}

async function ensureRuntimeSetup() {
  const runtimeStatus = getRuntimeSettingsStatus();
  if (runtimeStatus.isConfigured) {
    return true;
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const didCompleteSetup = await runSetupWizard();
    if (didCompleteSetup && getRuntimeSettingsStatus().isConfigured) {
      return true;
    }

    console.error(pc.yellow("Setup cancelled before runtime configuration was saved."));
    process.exitCode = 1;
    return false;
  }

  return !exitWithMissingRuntimeConfig();
}

function renderSettingsWarnings() {
  const warnings = getCliSettingsWarnings();
  if (warnings.length === 0) {
    return;
  }

  console.log();
  for (const warning of warnings) {
    console.log(pc.yellow(`Warning: ${warning}`));
  }
  console.log();
}

async function launchInteractive(options: StartReplOptions = {}) {
  if (!(await ensureRuntimeSetup())) {
    return;
  }

  startRepl(options);
}

async function readPromptFromStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  let raw = "";
  for await (const chunk of process.stdin) {
    raw += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
  }

  return raw.trim();
}

async function resolvePromptInput(promptParts?: string[]) {
  const directPrompt = promptParts?.join(" ").trim() ?? "";
  if (directPrompt) {
    return directPrompt;
  }

  return readPromptFromStdin();
}

async function runExecPrompt(prompt: string) {
  if (!(await ensureRuntimeSetup())) {
    return;
  }

  const settings = getCliSettings();
  const output = createCliOutputRenderer({
    animateThinking: settings.ui.animateNonInteractiveThinking,
  });
  const orchestrator = new Orchestrator();
  const sessionId = createSessionId();

  renderSettingsWarnings();
  output.renderUserInput(prompt);

  try {
    await orchestrator.processUserInput(prompt, (event) => output.renderEvent(event));
    const history = await orchestrator.getHistorySnapshot();
    await saveSession(sessionId, history);
  } finally {
    output.dispose();
    await clearMcpCache();
  }
}

function buildReviewPrompt(targetParts?: string[]) {
  const target = targetParts?.join(" ").trim() ?? "";

  if (target) {
    return `Review ${target} in the current workspace. Focus on bugs, regressions, behavioural risks, and missing tests. Report findings first with precise file references, then a brief summary.`;
  }

  return "Review the current workspace. Focus on bugs, regressions, behavioural risks, and missing tests. Report findings first with precise file references, then a brief summary.";
}

async function runLoginCommand() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(pc.red("Interactive login requires a TTY session."));
    console.error(pc.gray(`Run this in a terminal to save credentials to ${getUserSettingsPath()}.`));
    process.exitCode = 1;
    return;
  }

  const didCompleteSetup = await runSetupWizard();
  if (!didCompleteSetup) {
    console.error(pc.yellow("Login cancelled before runtime configuration was saved."));
    process.exitCode = 1;
    return;
  }

  console.log(pc.green(`Saved runtime credentials to ${getUserSettingsPath()}.`));
}

async function runLogoutCommand() {
  await clearUserRuntimeSettings();
  console.log(pc.green(`Removed saved runtime credentials from ${getUserSettingsPath()}.`));
  console.log(pc.gray("Workspace-level .creed/settings.json values, if any, can still override runtime config."));
}

async function runMcpListCommand() {
  try {
    const statuses = await getMcpServerStatuses();
    if (statuses.length === 0) {
      console.log(pc.yellow("No MCP servers configured yet."));
      console.log(pc.gray("Use `creed-cli mcp add <name> <command> [args...]` to register one."));
      return;
    }

    console.log(pc.cyan("Configured MCP servers"));
    console.log();

    for (const status of statuses) {
      const stateLabel = !status.enabled
        ? pc.gray("disabled")
        : status.connected
          ? pc.green(`connected (${status.toolCount} tool${status.toolCount === 1 ? "" : "s"})`)
          : pc.red("error");

      console.log(`${pc.white(status.name)} ${pc.gray("-")} ${stateLabel}`);
      console.log(pc.gray(`  command: ${[status.command, ...status.args].join(" ")}`));
      if (status.cwd) {
        console.log(pc.gray(`  cwd: ${status.cwd}`));
      }
      if (status.error) {
        console.log(pc.red(`  error: ${status.error}`));
      }
    }
  } finally {
    await clearMcpCache();
  }
}

async function runMcpAddCommand(
  name: string,
  command: string,
  args: string[],
  options: { env: string[]; cwd?: string; disable?: boolean },
) {
  if (!validateMcpServerName(name)) {
    throw new Error("MCP server name may only contain letters, numbers, hyphens, and underscores.");
  }

  validateMcpLaunchInput(name, command, args);

  const serverConfig: McpServerConfig = {
    command,
    args,
    env: parseMcpEnvEntries(options.env),
    cwd: options.cwd?.trim() || undefined,
    enabled: !options.disable,
  };

  await saveUserMcpServer(name, serverConfig);
  await clearMcpCache();
  console.log(pc.green(`Saved MCP server "${name}".`));
  console.log(pc.gray(`Command: ${[command, ...args].join(" ")}`));
  console.log(pc.gray(`Config file: ${getUserMcpPath()}`));
}

async function runMcpRemoveCommand(name: string) {
  const removed = await removeUserMcpServer(name);
  await clearMcpCache();

  if (!removed) {
    console.log(pc.yellow(`No MCP server named "${name}" was found.`));
    return;
  }

  console.log(pc.green(`Removed MCP server "${name}".`));
}

async function runMcpToolsCommand(serverName?: string) {
  try {
    const tools = await listMcpToolsForServer(serverName);
    if (tools.length === 0) {
      console.log(pc.yellow(serverName ? `No tools found for MCP server "${serverName}".` : "No MCP tools available."));
      return;
    }

    console.log(pc.cyan(serverName ? `MCP tools for ${serverName}` : "Discovered MCP tools"));
    console.log();

    for (const tool of tools) {
      console.log(`${pc.white(tool.qualifiedName)} ${pc.gray(`(${tool.actualToolName})`)}`);
      console.log(pc.gray(`  server: ${tool.serverName}`));
      if (tool.description) {
        console.log(pc.gray(`  description: ${tool.description}`));
      }
    }
  } finally {
    await clearMcpCache();
  }
}

const program = new Command();

program
  .name("creed-cli")
  .description("Natural language coding CLI")
  .version("0.1.0")
  .showHelpAfterError()
  .argument("[prompt...]", "Optional prompt to run immediately")
  .action(async (promptParts?: string[]) => {
    const prompt = promptParts?.join(" ").trim() ?? "";
    if (prompt) {
      await runExecPrompt(prompt);
      return;
    }

    await launchInteractive();
  });

program.addHelpText("after", "\nIf no subcommand is specified, CREED opens the interactive CLI.\n");

program
  .command("chat")
  .description("Start the interactive coding REPL")
  .action(async () => {
    await launchInteractive();
  });

program
  .command("login")
  .description("Manage login")
  .action(async () => {
    await runLoginCommand();
  });

program
  .command("logout")
  .description("Remove stored authentication credentials")
  .action(async () => {
    await runLogoutCommand();
  });

const mcpCommand = program
  .command("mcp")
  .description("Manage external MCP servers for Creed");

mcpCommand
  .command("list")
  .description("List configured MCP servers and connection status")
  .action(async () => {
    await runMcpListCommand();
  });

mcpCommand
  .command("add")
  .description("Add an MCP server that Creed can discover tools from")
  .argument("<name>", "Logical name for the server")
  .argument("<command>", "Executable used to start the MCP server")
  .argument("[args...]", "Arguments passed to the executable")
  .allowUnknownOption(true)
  .option("--cwd <dir>", "Working directory for the server process")
  .option(
    "--env <key=value>",
    "Environment variable for the server process (repeatable)",
    collectOptionValue,
    [],
  )
  .option("--disable", "Add the server in disabled mode")
  .action(
    async (
      name: string,
      command: string,
      args: string[],
      options: { env: string[]; cwd?: string; disable?: boolean },
    ) => {
      try {
        await runMcpAddCommand(name, command, args ?? [], options);
      } catch (error) {
        console.error(pc.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    },
  );

mcpCommand
  .command("remove")
  .description("Remove a configured MCP server")
  .argument("<name>", "Logical server name")
  .action(async (name: string) => {
    await runMcpRemoveCommand(name);
  });

mcpCommand
  .command("tools")
  .description("List tools discovered from configured MCP servers")
  .argument("[name]", "Optional MCP server name")
  .action(async (name?: string) => {
    try {
      await runMcpToolsCommand(name);
    } catch (error) {
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

mcpCommand.action(async () => {
  await runMcpListCommand();
});

void program.parseAsync();

