import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { loadTools } from "../tools";
import { executeTool } from "../tools/executor";

const DEFAULT_BASE_URL = process.env.CREED_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "http://localhost:20128/v1";
const DEFAULT_API_KEY = process.env.CREED_API_KEY ?? process.env.OPENAI_API_KEY ?? "local-development-key";
const DEFAULT_MODEL = process.env.CREED_MODEL ?? process.env.OPENAI_MODEL ?? "kr/claude-haiku-4.5";

export type OrchestratorEvent =
  | { type: "notice"; message: string }
  | { type: "thinking"; phase: "start" | "stop" }
  | { type: "assistant-message"; content: string }
  | { type: "tool-result"; name: string; result: string }
  | { type: "divider" }
  | { type: "error"; message: string };

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

export class Orchestrator {
  private history: any[] = [];
  private tools: any[];
  private mode = "code" as const;
  private openai: OpenAI;
  private ready: Promise<void>;
  private startupNotice: string | null = null;

  constructor() {
    this.tools = loadTools();

    this.openai = new OpenAI({
      baseURL: DEFAULT_BASE_URL,
      apiKey: DEFAULT_API_KEY,
    });

    this.ready = this.initSystemPrompt();
  }

  public getMode() {
    return this.mode;
  }

  public async getHistorySnapshot() {
    await this.ready;
    return JSON.parse(JSON.stringify(this.history));
  }

  public async restoreHistory(snapshot: any[]) {
    await this.ready;

    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      throw new Error("Saved session is empty or invalid.");
    }

    const [firstMessage] = snapshot;
    if (!firstMessage || firstMessage.role !== "system") {
      throw new Error("Saved session is missing the system prompt.");
    }

    this.history = JSON.parse(JSON.stringify(snapshot));
    this.startupNotice = null;
  }

  private emit(onEvent: OrchestratorEventHandler | undefined, event: OrchestratorEvent) {
    onEvent?.(event);
  }

  private async initSystemPrompt() {
    let systemMessage = "";
    try {
      const promptPath = path.join(__dirname, "..", "system_prompt", "Agent_Prompt.txt");
      systemMessage = await fs.readFile(promptPath, "utf-8");
    } catch {
      systemMessage = "You are an AI coding agent. You write code, refactor applications, and fix bugs autonomously. You have access to tools to navigate the codebase, search, read files, and write code.";
      this.startupNotice = "Warning: Could not load Agent_Prompt.txt, using default prompt.";
    }

    this.history = [{
      role: "system",
      content: systemMessage,
    }];
  }

  async processUserInput(input: string, onEvent?: OrchestratorEventHandler) {
    await this.ready;

    if (this.startupNotice) {
      this.emit(onEvent, { type: "notice", message: this.startupNotice });
      this.startupNotice = null;
    }

    const formattedInput = `<user_query>\n${input}\n</user_query>`;
    const turnStartLength = this.history.length;
    let usedToolsThisTurn = false;

    this.history.push({ role: "user", content: formattedInput });

    let isFinished = false;

    while (!isFinished) {
      try {
        this.emit(onEvent, { type: "thinking", phase: "start" });

        const requestOptions: any = {
          model: DEFAULT_MODEL,
          messages: this.history,
          stream: true,
        };

        if (this.tools.length > 0) {
          requestOptions.tools = this.tools.map((tool) => ({
            type: "function",
            function: tool,
          }));
        }

        const stream = await this.openai.chat.completions.create(requestOptions as any) as any;

        let fullContent = "";
        let toolCalls: any[] = [];

        if (typeof stream === "string") {
          const lines = stream.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) fullContent += delta.content;
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index;
                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: "",
                        type: "function",
                        function: { name: "", arguments: "" },
                      };
                    }
                    if (tc.id) toolCalls[index].id = tc.id;
                    if (tc.type) toolCalls[index].type = tc.type;
                    if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
                    if (tc.function?.arguments) {
                      toolCalls[index].function.arguments += tc.function.arguments;
                    }
                  }
                }
              } catch {
                // Ignore malformed streaming chunks from proxy.
              }
            }
          }
        } else {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullContent += delta.content;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: "",
                    type: "function",
                    function: { name: "", arguments: "" },
                  };
                }
                if (tc.id) toolCalls[index].id = tc.id;
                if (tc.type) toolCalls[index].type = tc.type;
                if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
                if (tc.function?.arguments) {
                  toolCalls[index].function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }

        this.emit(onEvent, { type: "thinking", phase: "stop" });
        toolCalls = toolCalls.filter(Boolean);

        const assistantMessage: any = {
          role: "assistant",
          content: fullContent || null,
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        if (!fullContent && toolCalls.length === 0) {
          throw new Error("No response from the model.");
        }

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          if (fullContent) {
            this.emit(onEvent, { type: "assistant-message", content: fullContent });
          }

          this.history.push(assistantMessage);

          for (const tc of assistantMessage.tool_calls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
              this.emit(onEvent, {
                type: "error",
                message: `Failed to parse tool arguments for ${tc.function.name || "tool"}. ${tc.function.arguments}`,
              });
            }

            const result = await executeTool(tc.function.name, parsedArgs);
            this.emit(onEvent, { type: "tool-result", name: tc.function.name, result });
            usedToolsThisTurn = true;

            this.history.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: result,
            });
          }
        } else {
          if (usedToolsThisTurn) {
            this.emit(onEvent, { type: "divider" });
          }

          if (assistantMessage.content) {
            this.emit(onEvent, { type: "assistant-message", content: assistantMessage.content });
          }

          this.history.push({ role: "assistant", content: assistantMessage.content });
          isFinished = true;
        }
      } catch (error: any) {
        this.emit(onEvent, { type: "thinking", phase: "stop" });
        this.emit(onEvent, {
          type: "error",
          message: `LLM API Error: ${error.message}`,
        });
        this.history = this.history.slice(0, turnStartLength);
        isFinished = true;
      }
    }
  }
}
