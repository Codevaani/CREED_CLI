import toolsData from "./tools.json";

const CORE_TOOL_NAMES = new Set([
  "read_file",
  "list_dir",
  "search_replace",
  "edit_file",
  "delete_file",
]);

export function loadTools() {
  const enabledToolNames = new Set(CORE_TOOL_NAMES);

  if (process.env.CREED_ENABLE_UNSAFE_COMMAND_TOOL === "1") {
    enabledToolNames.add("run_terminal_cmd");
  }

  return toolsData.filter((tool) => enabledToolNames.has(tool.name));
}
