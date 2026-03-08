import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { getCliSettings, type McpServerConfig } from "../config/settings";

type ToolDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

interface RegisteredMcpTool {
  qualifiedName: string;
  serverName: string;
  actualToolName: string;
}

interface McpServerConnection {
  name: string;
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: McpTool[];
}

export interface McpServerStatus {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  cwd?: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

const connectionCache = new Map<string, Promise<McpServerConnection>>();
const registeredTools = new Map<string, RegisteredMcpTool>();
const MCP_CONNECT_TIMEOUT_MS = 8_000;
const MAX_MCP_STDERR_TAIL_CHARS = 4_000;

function normalizeToolToken(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
}

function isNpxLikeCommand(command: string) {
  const normalized = command.trim().toLowerCase();
  return normalized === "npx" || normalized === "npx.cmd";
}

function hasLaunchTarget(args: string[]) {
  return args.some((arg) => !arg.trim().startsWith("-"));
}

function validateServerLaunchConfig(serverName: string, serverConfig: McpServerConfig) {
  if (isNpxLikeCommand(serverConfig.command) && !hasLaunchTarget(serverConfig.args)) {
    throw new Error(
      `MCP server "${serverName}" is missing the package or command argument for npx. ` +
      `Re-add it with: creed-cli mcp add ${serverName} npx -y <package-name>`
    );
  }
}

function getServerCacheKey(workspaceRoot: string, serverName: string, serverConfig: McpServerConfig) {
  return JSON.stringify({
    workspaceRoot: path.resolve(workspaceRoot),
    serverName,
    command: serverConfig.command,
    args: serverConfig.args,
    env: serverConfig.env,
    cwd: serverConfig.cwd ?? "",
    enabled: serverConfig.enabled,
  });
}

function getResolvedServerCwd(workspaceRoot: string, serverConfig: McpServerConfig) {
  if (!serverConfig.cwd) {
    return workspaceRoot;
  }

  return path.isAbsolute(serverConfig.cwd)
    ? serverConfig.cwd
    : path.resolve(workspaceRoot, serverConfig.cwd);
}

function buildQualifiedMcpToolName(serverName: string, toolName: string) {
  return `mcp__${normalizeToolToken(serverName)}__${normalizeToolToken(toolName)}`;
}

function createMcpStderrTailReader(transport: StdioClientTransport) {
  let stderrTail = "";

  transport.stderr?.on("data", (chunk) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    if (!text) {
      return;
    }

    stderrTail = `${stderrTail}${text}`.slice(-MAX_MCP_STDERR_TAIL_CHARS);
  });

  return () => stderrTail.trim();
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${MCP_CONNECT_TIMEOUT_MS}ms.`));
        }, MCP_CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function formatMcpToolResult(result: any) {
  const outputChunks: string[] = [];

  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      outputChunks.push(block.text.trim());
      continue;
    }

    if (block.type === "resource") {
      outputChunks.push(JSON.stringify(block.resource ?? block, null, 2));
      continue;
    }

    if (block.type === "image") {
      outputChunks.push(`[image:${block.mimeType}] ${block.data.length} byte(s)`);
      continue;
    }

    if (block.type === "audio") {
      outputChunks.push(`[audio:${block.mimeType}] ${block.data.length} byte(s)`);
      continue;
    }

    outputChunks.push(JSON.stringify(block, null, 2));
  }

  if (result.toolResult !== undefined) {
    outputChunks.push(JSON.stringify(result.toolResult, null, 2));
  }

  if (result.structuredContent !== undefined) {
    outputChunks.push(JSON.stringify(result.structuredContent, null, 2));
  }

  const normalizedOutput = outputChunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join("\n\n");

  if (normalizedOutput) {
    return result.isError ? `MCP tool reported an error.\n\n${normalizedOutput}` : normalizedOutput;
  }

  return result.isError ? "MCP tool reported an error with no text output." : "MCP tool completed with no text output.";
}

async function connectServer(
  workspaceRoot: string,
  serverName: string,
  serverConfig: McpServerConfig,
): Promise<McpServerConnection> {
  validateServerLaunchConfig(serverName, serverConfig);

  const cacheKey = getServerCacheKey(workspaceRoot, serverName, serverConfig);
  const cachedConnection = connectionCache.get(cacheKey);
  if (cachedConnection) {
    return cachedConnection;
  }

  const connectionPromise = (async () => {
    const env = {
      ...getDefaultEnvironment(),
      ...Object.fromEntries(
        DEFAULT_INHERITED_ENV_VARS
          .filter((key) => typeof process.env[key] === "string")
          .map((key) => [key, process.env[key] as string]),
      ),
      ...serverConfig.env,
    };

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env,
      cwd: getResolvedServerCwd(workspaceRoot, serverConfig),
      stderr: "pipe",
    });
    const readStderrTail = createMcpStderrTailReader(transport);

    const client = new Client(
      {
        name: "creed-cli",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await withTimeout(client.connect(transport), `Connecting to MCP server "${serverName}"`);
      const toolsResponse = await withTimeout(
        client.listTools(),
        `Loading tools from MCP server "${serverName}"`,
      );

      return {
        name: serverName,
        config: serverConfig,
        client,
        transport,
        tools: toolsResponse.tools,
      };
    } catch (error) {
      const stderrTail = readStderrTail();
      if (!stderrTail) {
        throw error;
      }

      const baseMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${baseMessage}\n\n[MCP stderr]\n${stderrTail}`);
    }
  })();

  connectionCache.set(cacheKey, connectionPromise);

  try {
    return await connectionPromise;
  } catch (error) {
    connectionCache.delete(cacheKey);
    throw error;
  }
}

export async function clearMcpCache() {
  const activeConnections = [...connectionCache.values()];
  connectionCache.clear();
  registeredTools.clear();

  await Promise.all(
    activeConnections.map(async (connectionPromise) => {
      try {
        const connection = await connectionPromise;
        await connection.transport.close();
      } catch {
        // Ignore teardown failures.
      }
    }),
  );
}

export async function loadMcpTools(workspaceRoot = process.cwd()): Promise<ToolDefinition[]> {
  const settings = getCliSettings(workspaceRoot);
  const servers = settings.mcp.servers;
  registeredTools.clear();

  const discoveredTools: ToolDefinition[] = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (!serverConfig.enabled) {
      continue;
    }

    try {
      const connection = await connectServer(workspaceRoot, serverName, serverConfig);
      for (const tool of connection.tools) {
        const qualifiedName = buildQualifiedMcpToolName(serverName, tool.name);
        registeredTools.set(qualifiedName, {
          qualifiedName,
          serverName,
          actualToolName: tool.name,
        });
        discoveredTools.push({
          name: qualifiedName,
          description: `[MCP:${serverName}] ${tool.description ?? tool.name}`,
          parameters: tool.inputSchema,
        });
      }
    } catch {
      // Skip broken MCP servers during tool loading. The mcp list command surfaces failures.
    }
  }

  return discoveredTools;
}

export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceRoot = process.cwd(),
) {
  let registeredTool = registeredTools.get(toolName);
  if (!registeredTool) {
    await loadMcpTools(workspaceRoot);
    registeredTool = registeredTools.get(toolName);
  }

  if (!registeredTool) {
    return null;
  }

  const serverConfig = getCliSettings(workspaceRoot).mcp.servers[registeredTool.serverName];
  if (!serverConfig || !serverConfig.enabled) {
    return `MCP server "${registeredTool.serverName}" is not enabled.`;
  }

  const connection = await connectServer(workspaceRoot, registeredTool.serverName, serverConfig);
  const result = await connection.client.callTool({
    name: registeredTool.actualToolName,
    arguments: args ?? {},
  });

  return formatMcpToolResult(result);
}

export async function getMcpServerStatuses(workspaceRoot = process.cwd()): Promise<McpServerStatus[]> {
  const settings = getCliSettings(workspaceRoot);
  const statuses: McpServerStatus[] = [];

  for (const [serverName, serverConfig] of Object.entries(settings.mcp.servers)) {
    if (!serverConfig.enabled) {
      statuses.push({
        name: serverName,
        enabled: false,
        command: serverConfig.command,
        args: [...serverConfig.args],
        cwd: serverConfig.cwd,
        connected: false,
        toolCount: 0,
      });
      continue;
    }

    try {
      const connection = await connectServer(workspaceRoot, serverName, serverConfig);
      statuses.push({
        name: serverName,
        enabled: true,
        command: serverConfig.command,
        args: [...serverConfig.args],
        cwd: serverConfig.cwd,
        connected: true,
        toolCount: connection.tools.length,
      });
    } catch (error) {
      statuses.push({
        name: serverName,
        enabled: true,
        command: serverConfig.command,
        args: [...serverConfig.args],
        cwd: serverConfig.cwd,
        connected: false,
        toolCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return statuses.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listMcpToolsForServer(serverName?: string, workspaceRoot = process.cwd()) {
  const settings = getCliSettings(workspaceRoot);
  const matchingServers = Object.entries(settings.mcp.servers).filter(([name, config]) =>
    config.enabled && (!serverName || name === serverName),
  );

  const tools: Array<{ serverName: string; qualifiedName: string; actualToolName: string; description?: string }> = [];

  for (const [name, config] of matchingServers) {
    const connection = await connectServer(workspaceRoot, name, config);
    for (const tool of connection.tools) {
      tools.push({
        serverName: name,
        qualifiedName: buildQualifiedMcpToolName(name, tool.name),
        actualToolName: tool.name,
        description: tool.description,
      });
    }
  }

  return tools.sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName));
}
