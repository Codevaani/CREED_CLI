import toolsData from "./tools.json";
import { getCliSettings } from "../config/settings";
import { loadMcpTools } from "../mcp";

const CORE_TOOL_NAMES = new Set([
  "read_file",
  "list_dir",
  "search_replace",
  "edit_file",
  "delete_file",
  "web_search",
]);

export async function loadTools() {
  const settings = getCliSettings();
  const enabledToolNames = new Set(CORE_TOOL_NAMES);

  if (settings.shell.enableUnsafeCommands) {
    enabledToolNames.add("run_terminal_cmd");
  }

  const localTools = toolsData.filter((tool) => enabledToolNames.has(tool.name));
  const mcpTools = await loadMcpTools();

  return [...localTools, ...mcpTools];
}
