import { Command } from "commander";
import pc from "picocolors";
import { Orchestrator } from "./agent/orchestrator";
import {
  clearUserRuntimeSettings,
  getCliSettings,
  getCliSettingsSources,
  getCliSettingsWarnings,
  getRuntimeSettingsStatus,
  getUserSettingsPath,
} from "./config/settings";
import { startRepl, type StartReplOptions } from "./repl";
import { createCliOutputRenderer } from "./repl/output";
import { createSessionId, saveSession } from "./repl/session-store";
import { runSetupWizard } from "./setup/wizard";

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

function printPlaceholderCommand(command: string, detail: string) {
  console.error(pc.yellow(`${command} is not implemented yet.`));
  console.error(pc.gray(detail));
  process.exitCode = 1;
}

function runFeaturesCommand() {
  const settings = getCliSettings();

  console.log(pc.cyan("CREED CLI features"));
  console.log();
  console.log(`${pc.green("interactive")} chat, resume picker, fork flow, model picker`);
  console.log(`${pc.green("non-interactive")} exec and review commands`);
  console.log(`${pc.green("runtime")} ${settings.runtime.provider} provider, model switching, setup wizard`);
  console.log(`${pc.green("storage")} user-level sessions.sqlite and JSON settings`);
  console.log(`${pc.green("tools")} file tools, web_search, optional unsafe shell gate`);
  console.log();
  console.log(pc.gray("Planned / placeholder surfaces: mcp, app-server, cloud, apply, completion."));
}

function runDebugCommand() {
  const settings = getCliSettings();
  const sources = getCliSettingsSources();
  const runtimeStatus = getRuntimeSettingsStatus();

  console.log(pc.cyan("CREED CLI debug"));
  console.log();
  console.log(`workspace: ${process.cwd()}`);
  console.log(`user settings: ${getUserSettingsPath()}`);
  console.log(`settings sources: ${sources.length > 0 ? sources.join(", ") : "none"}`);
  console.log(`runtime configured: ${runtimeStatus.isConfigured ? "yes" : "no"}`);
  console.log(`runtime provider: ${settings.runtime.provider || "unset"}`);
  console.log(`runtime model: ${settings.runtime.model || "unset"}`);
  console.log(`shell tool enabled: ${settings.shell.enableUnsafeCommands ? "yes" : "no"}`);

  if (!runtimeStatus.isConfigured) {
    console.log(`missing runtime fields: ${runtimeStatus.missing.join(", ")}`);
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
  .command("exec")
  .alias("e")
  .description("Run Creed non-interactively")
  .argument("[prompt...]", "Prompt to run")
  .action(async (promptParts?: string[]) => {
    const prompt = await resolvePromptInput(promptParts);
    if (!prompt) {
      console.error(pc.red("No prompt provided."));
      console.error(pc.gray("Pass a prompt as arguments or pipe it on stdin."));
      process.exitCode = 1;
      return;
    }

    await runExecPrompt(prompt);
  });

program
  .command("review")
  .description("Run a code review non-interactively")
  .argument("[target...]", "Optional file, directory, or review target")
  .action(async (targetParts?: string[]) => {
    await runExecPrompt(buildReviewPrompt(targetParts));
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

program
  .command("mcp")
  .description("Manage external MCP servers for Creed")
  .action(() => {
    printPlaceholderCommand("mcp", "MCP management commands are not wired yet in this CLI.");
  });

program
  .command("mcp-server")
  .description("Start Creed as an MCP server (stdio)")
  .action(() => {
    printPlaceholderCommand("mcp-server", "Running Creed as an MCP server is not implemented yet.");
  });

program
  .command("app-server")
  .description("[experimental] Run the app server or related tooling")
  .action(() => {
    printPlaceholderCommand("app-server", "The app-server surface is reserved but not implemented yet.");
  });

program
  .command("completion")
  .description("Generate shell completion scripts")
  .action(() => {
    printPlaceholderCommand("completion", "Shell completion generation is not implemented yet.");
  });

program
  .command("sandbox")
  .description("Inspect sandbox and execution safety defaults")
  .action(() => {
    const settings = getCliSettings();
    console.log(pc.cyan("CREED sandbox status"));
    console.log();
    console.log(`workspace root: ${process.cwd()}`);
    console.log(`unsafe shell tool enabled: ${settings.shell.enableUnsafeCommands ? "yes" : "no"}`);
    console.log("file tools: workspace-scoped");
    console.log("approval flow: not implemented as a separate command yet");
  });

program
  .command("debug")
  .description("Debugging tools")
  .action(() => {
    runDebugCommand();
  });

program
  .command("apply")
  .alias("a")
  .description("Apply the latest generated diff to the working tree")
  .action(() => {
    printPlaceholderCommand("apply", "Diff artifact apply is not implemented yet in CREED CLI.");
  });

program
  .command("resume")
  .description("Resume a previous interactive session")
  .option("--last", "Continue the most recent saved session")
  .action(async (options: { last?: boolean }) => {
    await launchInteractive(options.last ? { resumeLatest: true } : { openResumePicker: true });
  });

program
  .command("fork")
  .description("Fork a previous interactive session")
  .option("--last", "Fork the most recent saved session")
  .action(async (options: { last?: boolean }) => {
    await launchInteractive(options.last ? { forkLatest: true } : { openForkPicker: true });
  });

program
  .command("cloud")
  .description("[experimental] Browse tasks from Creed Cloud and apply changes locally")
  .action(() => {
    printPlaceholderCommand("cloud", "Cloud task browsing is not implemented yet.");
  });

program
  .command("features")
  .description("Inspect feature flags")
  .action(() => {
    runFeaturesCommand();
  });

void program.parseAsync();
