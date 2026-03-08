import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { getCliSettings } from "../config/settings";
import { executeMcpTool } from "../mcp";

const execAsync = util.promisify(exec);
const EXISTING_CODE_MARKERS = [
  "// ... existing code ...",
  "# ... existing code ...",
  "<!-- ... existing code ... -->",
];
const DIFF_CONTEXT_LINES = 2;
const MAX_DIFF_LINES = 28;
type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function resolveWorkspacePath(workspaceRoot: string, targetPath: string) {
  const resolvedPath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, resolvedPath);
  const escapesWorkspace =
    relativePath.startsWith("..") || path.isAbsolute(relativePath);

  if (escapesWorkspace) {
    throw new Error("Path escapes the workspace root.");
  }

  return resolvedPath;
}

function hasMultipleOccurrences(content: string, needle: string) {
  const firstIndex = content.indexOf(needle);
  if (firstIndex === -1) return false;

  return content.indexOf(needle, firstIndex + needle.length) !== -1;
}

function isSketchEdit(codeEdit: string) {
  return EXISTING_CODE_MARKERS.some((marker) => codeEdit.includes(marker));
}

function normalizeDiffPath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function normalizeLineEndings(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function toLines(content: string) {
  const normalized = normalizeLineEndings(content);
  if (!normalized) return [];

  const withoutTrailingNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;

  return withoutTrailingNewline ? withoutTrailingNewline.split("\n") : [];
}

function truncateDiffLines(lines: string[]) {
  if (lines.length <= MAX_DIFF_LINES) {
    return lines;
  }

  return [
    ...lines.slice(0, MAX_DIFF_LINES),
    `... diff truncated (${lines.length - MAX_DIFF_LINES} more line(s))`,
  ];
}

function buildCreateDiff(filePath: string, content: string) {
  const displayPath = normalizeDiffPath(filePath);
  const addedLines = toLines(content);
  const diffBody = truncateDiffLines(addedLines.map((line) => `+${line}`));

  return [
    "--- /dev/null",
    `+++ b/${displayPath}`,
    `@@ -0,0 +1,${addedLines.length} @@`,
    ...diffBody,
  ].join("\n");
}

function buildDeleteDiff(filePath: string, content: string) {
  const displayPath = normalizeDiffPath(filePath);
  const removedLines = toLines(content);
  const diffBody = truncateDiffLines(removedLines.map((line) => `-${line}`));

  return [
    `--- a/${displayPath}`,
    "+++ /dev/null",
    `@@ -1,${removedLines.length} +0,0 @@`,
    ...diffBody,
  ].join("\n");
}

function buildUpdateDiff(filePath: string, beforeContent: string, afterContent: string) {
  const displayPath = normalizeDiffPath(filePath);
  const beforeLines = toLines(beforeContent);
  const afterLines = toLines(afterContent);

  if (beforeLines.length === 0) {
    return buildCreateDiff(filePath, afterContent);
  }

  if (afterLines.length === 0) {
    return buildDeleteDiff(filePath, beforeContent);
  }

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removedLines = beforeLines.slice(prefix, beforeLines.length - suffix);
  const addedLines = afterLines.slice(prefix, afterLines.length - suffix);

  if (removedLines.length === 0 && addedLines.length === 0) {
    return `No visible changes in ${displayPath}`;
  }

  const contextStart = Math.max(0, prefix - DIFF_CONTEXT_LINES);
  const contextEnd = Math.min(beforeLines.length - suffix + DIFF_CONTEXT_LINES, beforeLines.length);
  const beforeContext = beforeLines.slice(contextStart, prefix);
  const afterContext = beforeLines.slice(beforeLines.length - suffix, contextEnd);
  const hunkLines = [
    ...beforeContext.map((line) => ` ${line}`),
    ...addedLines.map((line) => `+${line}`),
    ...removedLines.map((line) => `-${line}`),
    ...afterContext.map((line) => ` ${line}`),
  ];

  const diffBody = truncateDiffLines(hunkLines);
  const oldStart = contextStart + 1;
  const newStart = contextStart + 1;
  const oldCount = beforeContext.length + removedLines.length + afterContext.length;
  const newCount = beforeContext.length + addedLines.length + afterContext.length;

  return [
    `--- a/${displayPath}`,
    `+++ b/${displayPath}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...diffBody,
  ].join("\n");
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtmlTags(text: string) {
  return text.replace(/<[^>]+>/g, " ");
}

function normalizeWebText(text: string) {
  return decodeHtmlEntities(stripHtmlTags(text)).replace(/\s+/g, " ").trim();
}

function resolveSearchResultUrl(rawHref: string) {
  const decodedHref = decodeHtmlEntities(rawHref);
  const absoluteHref = decodedHref.startsWith("//")
    ? `https:${decodedHref}`
    : decodedHref;

  try {
    const url = new URL(absoluteHref);
    const redirectedUrl = url.searchParams.get("uddg");
    return redirectedUrl ? decodeURIComponent(redirectedUrl) : absoluteHref;
  } catch {
    return absoluteHref;
  }
}

function parseDuckDuckGoResults(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.split('<div class="links_main links_deep result__body">');

  for (const block of blocks.slice(1)) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);

    const rawHref = titleMatch?.[1];
    const rawTitle = titleMatch?.[2];
    const rawSnippet = snippetMatch?.[1] ?? "";

    if (!rawHref || !rawTitle) {
      continue;
    }

    const title = normalizeWebText(rawTitle);
    const url = resolveSearchResultUrl(rawHref);
    const snippet = normalizeWebText(rawSnippet);

    if (!title || !url) {
      continue;
    }

    results.push({ title, url, snippet });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

async function performWebSearch(searchTerm: string) {
  const settings = getCliSettings();
  const endpoint = settings.webSearch.endpoint;
  const resultLimit = settings.webSearch.maxResults;

  const searchUrl = new URL(endpoint);
  searchUrl.searchParams.set("q", searchTerm);

  const response = await fetch(searchUrl.toString(), {
    headers: {
      "user-agent": "creed-cli/1.0 (+https://duckduckgo.com/html/)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const results = parseDuckDuckGoResults(html, resultLimit);

  if (results.length === 0) {
    return `No web results found for "${searchTerm}".`;
  }

  return [
    `Web results for "${searchTerm}":`,
    ...results.flatMap((result, index) => [
      `${index + 1}. ${result.title}`,
      `   URL: ${result.url}`,
      `   Snippet: ${result.snippet || "No snippet available."}`,
    ]),
  ].join("\n");
}

export async function executeTool(name: string, args: any): Promise<string> {
  const workspaceRoot = path.resolve(process.cwd());
  const settings = getCliSettings(workspaceRoot);

  try {
    switch (name) {
      case "list_dir": {
        const { relative_workspace_path = "." } = args;
        const targetPath = resolveWorkspacePath(workspaceRoot, relative_workspace_path);
        const files = await fs.readdir(targetPath, { withFileTypes: true });

        const output = files.map((f) => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n");
        return output || "Directory is empty.";
      }

      case "read_file": {
        const { target_file, start_line_one_indexed, end_line_one_indexed_inclusive, should_read_entire_file } = args;
        const targetPath = resolveWorkspacePath(workspaceRoot, target_file);
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
        if (!settings.shell.enableUnsafeCommands) {
          return `Command execution is disabled in this session. Proposed command: ${command}`;
        }

        if (is_background) {
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
        const targetPath = resolveWorkspacePath(workspaceRoot, target_file);
        const existingContent = await fs.readFile(targetPath, "utf-8");
        await fs.unlink(targetPath);
        return buildDeleteDiff(target_file, existingContent);
      }

      case "search_replace": {
        const { file_path, old_string, new_string } = args;
        const targetPath = resolveWorkspacePath(workspaceRoot, file_path);
        const originalContent = await fs.readFile(targetPath, "utf-8");
        let content = originalContent;

        if (!content.includes(old_string)) {
          return `Error: old_string not found in ${file_path}. Make sure whitespace and indentation match exactly.`;
        }

        if (hasMultipleOccurrences(content, old_string)) {
          return `Error: old_string is not unique in ${file_path}. Provide more surrounding context so only one match exists.`;
        }

        content = content.replace(old_string, new_string);
        await fs.writeFile(targetPath, content, "utf-8");
        return buildUpdateDiff(file_path, originalContent, content);
      }

      case "edit_file": {
        const { target_file, code_edit } = args;
        const targetPath = resolveWorkspacePath(workspaceRoot, target_file);

        try {
          await fs.access(targetPath);

          if (isSketchEdit(code_edit)) {
            return "Error: edit_file does not support partial sketch edits for existing files. Use search_replace for targeted edits, or send the full file contents to overwrite the file.";
          }

          const existingContent = await fs.readFile(targetPath, "utf-8");
          await fs.writeFile(targetPath, code_edit, "utf-8");
          return buildUpdateDiff(target_file, existingContent, code_edit);
        } catch {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, code_edit, "utf-8");
          return buildCreateDiff(target_file, code_edit);
        }
      }

      case "web_search": {
        const { search_term } = args;
        if (!search_term || typeof search_term !== "string") {
          return "Error: search_term is required for web_search.";
        }

        return await performWebSearch(search_term);
      }

      default:
        {
          const mcpResult = await executeMcpTool(name, args, workspaceRoot);
          if (mcpResult !== null) {
            return mcpResult;
          }
        }
        return `Tool '${name}' is not yet implemented in the local executor.`;
    }
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
}
