import { Command } from "commander";
import pc from "picocolors";
import { getCliSettingsSources, getRuntimeSettingsStatus } from "./config/settings";
import { startRepl } from "./repl";

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
  console.error(pc.gray("2. user file: %USERPROFILE%\\.creed\\settings.json"));
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

const program = new Command();

program
  .name("creed-cli")
  .description("Natural language coding CLI")
  .version("0.1.0");

program
  .command("chat")
  .description("Start the interactive coding REPL")
  .action(() => {
    if (exitWithMissingRuntimeConfig()) {
      return;
    }

    startRepl();
  });

program.parse();
