import toolsData from "./tools.json";
import { getCliSettings } from "../config/settings";

const CORE_TOOL_NAMES = new Set([
  "read_file",
  "list_dir",
  "search_replace",
  "edit_file",
  "delete_file",
  "web_search",
]);

export function loadTools() {
  const settings = getCliSettings();
  const enabledToolNames = new Set(CORE_TOOL_NAMES);

  if (settings.shell.enableUnsafeCommands) {
    enabledToolNames.add("run_terminal_cmd");
  }

  return toolsData.filter((tool) => enabledToolNames.has(tool.name));
}
