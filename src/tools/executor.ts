import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export async function executeTool(name: string, args: any): Promise<string> {
  const workspaceRoot = process.cwd(); // Assume CLI runs from the project root

  try {
    switch (name) {
      case "list_dir": {
        const { relative_workspace_path } = args;
        const targetPath = path.resolve(workspaceRoot, relative_workspace_path);
        const files = await fs.readdir(targetPath, { withFileTypes: true });
        
        const output = files.map((f) => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n");
        return output || "Directory is empty.";
      }

      case "read_file": {
        const { target_file, start_line_one_indexed, end_line_one_indexed_inclusive, should_read_entire_file } = args;
        const targetPath = path.resolve(workspaceRoot, target_file);
        const content = await fs.readFile(targetPath, "utf-8");
        
        if (should_read_entire_file) {
          return content;
        }

        const lines = content.split("\n");
        const start = Math.max(0, (start_line_one_indexed || 1) - 1);
        const end = Math.min(lines.length, end_line_one_indexed_inclusive || lines.length);
        
        const snippet = lines.slice(start, end).map((line, idx) => `${start + idx + 1}: ${line}`).join("\n");
        return snippet || "No content found in the specified range.";
      }

      case "run_terminal_cmd": {
        const { command, is_background } = args;
        if (is_background) {
          // Just spawn it and don't wait
          exec(command, { cwd: workspaceRoot });
          return `Started background command: ${command}`;
        } else {
          const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot });
          let res = stdout;
          if (stderr) res += `\n[STDERR]\n${stderr}`;
          return res.trim() || "Command executed successfully with no output.";
        }
      }

      case "delete_file": {
        const { target_file } = args;
        const targetPath = path.resolve(workspaceRoot, target_file);
        await fs.unlink(targetPath);
        return `Successfully deleted ${target_file}`;
      }

      case "search_replace": {
        const { file_path, old_string, new_string } = args;
        const targetPath = path.resolve(workspaceRoot, file_path);
        let content = await fs.readFile(targetPath, "utf-8");
        
        if (!content.includes(old_string)) {
          return `Error: old_string not found in ${file_path}. Make sure whitespace and indentation match exactly.`;
        }

        content = content.replace(old_string, new_string);
        await fs.writeFile(targetPath, content, "utf-8");
        return `Successfully replaced text in ${file_path}`;
      }

      case "edit_file": {
        const { target_file, code_edit, instructions } = args;
        const targetPath = path.resolve(workspaceRoot, target_file);
        
        // For phase 2, we do a naive overwrite if it's a new file.
        // Complex structural edits via `// ... existing code ...` need a smarter parse engine.
        // Let's check if the file exists.
        try {
          await fs.access(targetPath);
          return `Warning: edit_file with partial diffing is not fully implemented yet. Please use search_replace for precise edits, or this tool will attempt a naive overwrite if pushed. (Content was NOT written to prevent data loss).`;
        } catch {
          // File does not exist, safe to write new file
          await fs.writeFile(targetPath, code_edit, "utf-8");
          return `Created new file: ${target_file}`;
        }
      }

      default:
        return `Tool '${name}' is not yet implemented in the local executor.`;
    }
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
}
