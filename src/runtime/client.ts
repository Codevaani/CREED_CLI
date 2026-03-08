import OpenAI from "openai";
import type { PersistedRuntimeSettings, RuntimeProvider } from "../config/settings";

type RuntimeHistoryMessage = Record<string, any>;
type ToolDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export interface RuntimeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface RuntimeTurnResult {
  content: string;
  toolCalls: RuntimeToolCall[];
}

export interface RuntimeConnectionTestResult {
  provider: RuntimeProvider;
  baseUrl: string;
  model: string;
  replyPreview: string;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function unwrapUserQuery(content: unknown) {
  if (typeof content !== "string") {
    return "";
  }

  const match = content.match(/^<user_query>\s*([\s\S]*?)\s*<\/user_query>$/);
  return match ? match[1] ?? "" : content;
}

function parseToolArguments(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildAnthropicMessagesUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);

  if (normalized.endsWith("/v1/messages")) {
    return normalized;
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/messages`;
  }

  return `${normalized}/v1/messages`;
}

function mergeAnthropicUserBlocks(messages: Array<{ role: "user" | "assistant"; content: any[] }>, blocks: any[]) {
  if (blocks.length === 0) {
    return;
  }

  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "user") {
    lastMessage.content.push(...blocks);
    return;
  }

  messages.push({
    role: "user",
    content: blocks,
  });
}

function buildAnthropicRequest(history: RuntimeHistoryMessage[], tools: ToolDefinition[]) {
  const firstMessage = history[0];
  const system = typeof firstMessage?.content === "string" ? firstMessage.content : "";
  const messages: Array<{ role: "user" | "assistant"; content: any[] }> = [];
  let pendingToolResults: any[] = [];

  for (const message of history.slice(1)) {
    if (message.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: message.tool_call_id,
        content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""),
      });
      continue;
    }

    if (pendingToolResults.length > 0) {
      mergeAnthropicUserBlocks(messages, pendingToolResults);
      pendingToolResults = [];
    }

    if (message.role === "user") {
      mergeAnthropicUserBlocks(messages, [
        {
          type: "text",
          text: unwrapUserQuery(message.content),
        },
      ]);
      continue;
    }

    if (message.role !== "assistant") {
      continue;
    }

    const assistantBlocks: any[] = [];
    if (typeof message.content === "string" && message.content.trim()) {
      assistantBlocks.push({
        type: "text",
        text: message.content,
      });
    }

    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall?.function?.name;
        if (typeof toolName !== "string" || !toolName.trim()) {
          continue;
        }

        assistantBlocks.push({
          type: "tool_use",
          id: typeof toolCall.id === "string" && toolCall.id ? toolCall.id : crypto.randomUUID(),
          name: toolName,
          input: parseToolArguments(toolCall?.function?.arguments),
        });
      }
    }

    if (assistantBlocks.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantBlocks,
      });
    }
  }

  if (pendingToolResults.length > 0) {
    mergeAnthropicUserBlocks(messages, pendingToolResults);
  }

  return {
    system,
    messages,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.parameters ?? {
        type: "object",
        properties: {},
      },
    })),
  };
}

async function parseResponseBody(response: Response) {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as any;
  } catch {
    return rawBody;
  }
}

function extractApiErrorMessage(body: unknown, status: number, statusText: string) {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const error = (body as Record<string, any>).error;
    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object" && typeof error.message === "string") {
      return error.message;
    }

    if (typeof (body as Record<string, any>).message === "string") {
      return (body as Record<string, any>).message;
    }
  }

  return `${status} ${statusText}`.trim();
}

async function createOpenAiTurn(config: PersistedRuntimeSettings, history: RuntimeHistoryMessage[], tools: ToolDefinition[]) {
  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  const requestOptions: any = {
    model: config.model,
    messages: history,
    stream: true,
  };

  if (tools.length > 0) {
    requestOptions.tools = tools.map((tool) => ({
      type: "function",
      function: tool,
    }));
  }

  const stream = await client.chat.completions.create(requestOptions as any) as any;
  let fullContent = "";
  let toolCalls: RuntimeToolCall[] = [];

  if (typeof stream === "string") {
    const lines = stream.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) {
        continue;
      }

      try {
        const parsed = JSON.parse(line.slice(6));
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
        }

        if (!delta?.tool_calls) {
          continue;
        }

        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          if (!toolCalls[index]) {
            toolCalls[index] = {
              id: "",
              type: "function",
              function: { name: "", arguments: "" },
            };
          }

          if (toolCall.id) {
            toolCalls[index]!.id = toolCall.id;
          }

          if (toolCall.function?.name) {
            toolCalls[index]!.function.name = toolCall.function.name;
          }

          if (toolCall.function?.arguments) {
            toolCalls[index]!.function.arguments += toolCall.function.arguments;
          }
        }
      } catch {
        // Ignore malformed chunks from compatible proxies.
      }
    }
  } else {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      if (delta.content) {
        fullContent += delta.content;
      }

      if (!delta.tool_calls) {
        continue;
      }

      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index;
        if (!toolCalls[index]) {
          toolCalls[index] = {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
        }

        if (toolCall.id) {
          toolCalls[index]!.id = toolCall.id;
        }

        if (toolCall.function?.name) {
          toolCalls[index]!.function.name = toolCall.function.name;
        }

        if (toolCall.function?.arguments) {
          toolCalls[index]!.function.arguments += toolCall.function.arguments;
        }
      }
    }
  }

  const filteredToolCalls = toolCalls.filter(Boolean);
  if (!fullContent && filteredToolCalls.length === 0) {
    throw new Error("No response from the model.");
  }

  return {
    content: fullContent,
    toolCalls: filteredToolCalls,
  };
}

async function createAnthropicTurn(config: PersistedRuntimeSettings, history: RuntimeHistoryMessage[], tools: ToolDefinition[]) {
  const requestBody = buildAnthropicRequest(history, tools);
  const response = await fetch(buildAnthropicMessagesUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: requestBody.system,
      max_tokens: 1024,
      messages: requestBody.messages,
      tools: requestBody.tools,
    }),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(responseBody, response.status, response.statusText));
  }

  const contentBlocks: Array<Record<string, any>> = Array.isArray((responseBody as Record<string, any>)?.content)
    ? (responseBody as Record<string, any>).content
    : [];

  const content = contentBlocks
    .filter((block: Record<string, any>) => block?.type === "text" && typeof block.text === "string")
    .map((block: Record<string, any>) => block.text)
    .join("");

  const toolCalls = contentBlocks
    .filter((block: Record<string, any>) => block?.type === "tool_use" && typeof block.name === "string")
    .map((block: Record<string, any>) => ({
      id: typeof block.id === "string" && block.id ? block.id : crypto.randomUUID(),
      type: "function" as const,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      },
    }));

  if (!content && toolCalls.length === 0) {
    throw new Error("No response from the model.");
  }

  return {
    content,
    toolCalls,
  };
}

export async function createRuntimeTurn(
  config: PersistedRuntimeSettings,
  history: RuntimeHistoryMessage[],
  tools: ToolDefinition[],
): Promise<RuntimeTurnResult> {
  if (config.provider === "anthropic-compatible") {
    return createAnthropicTurn(config, history, tools);
  }

  return createOpenAiTurn(config, history, tools);
}

async function testOpenAiCompatibleConnection(config: PersistedRuntimeSettings) {
  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
    stream: false,
  } as any);

  return completion.choices?.[0]?.message?.content?.toString().trim() || "hello";
}

async function testAnthropicCompatibleConnection(config: PersistedRuntimeSettings) {
  const response = await fetch(buildAnthropicMessagesUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 32,
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    }),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(responseBody, response.status, response.statusText));
  }

  const contentBlocks: Array<Record<string, any>> = Array.isArray((responseBody as Record<string, any>)?.content)
    ? (responseBody as Record<string, any>).content
    : [];

  return (
    contentBlocks
      .filter((block: Record<string, any>) => block?.type === "text" && typeof block.text === "string")
      .map((block: Record<string, any>) => block.text)
      .join("")
      .trim() || "hello"
  );
}

export async function testRuntimeConnection(
  config: PersistedRuntimeSettings,
): Promise<RuntimeConnectionTestResult> {
  const replyPreview =
    config.provider === "anthropic-compatible"
      ? await testAnthropicCompatibleConnection(config)
      : await testOpenAiCompatibleConnection(config);

  return {
    provider: config.provider,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: config.model.trim(),
    replyPreview,
  };
}
