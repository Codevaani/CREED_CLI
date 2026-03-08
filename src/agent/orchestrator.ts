import fs from "fs/promises";
import path from "path";
import { getCliSettings, type PersistedRuntimeSettings } from "../config/settings";
import { createRuntimeTurn } from "../runtime/client";
import { loadTools } from "../tools";
import { executeTool } from "../tools/executor";

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
  private ready: Promise<void>;
  private startupNotice: string | null = null;
  private runtime: PersistedRuntimeSettings;

  constructor() {
    const settings = getCliSettings();
    this.tools = [];
    this.runtime = {
      provider: settings.runtime.provider,
      model: settings.runtime.model,
      baseUrl: settings.runtime.baseUrl,
      apiKey: settings.runtime.apiKey,
    };

    this.ready = this.initialize();
  }

  private async initialize() {
    this.tools = await loadTools();
    await this.initSystemPrompt();
  }

  public getMode() {
    return this.mode;
  }

  public getRuntimeConfig(): PersistedRuntimeSettings {
    return { ...this.runtime };
  }

  public setRuntimeModel(model: string) {
    this.runtime.model = model.trim();
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
        const { content: fullContent, toolCalls } = await createRuntimeTurn(
          this.runtime,
          this.history,
          this.tools,
        );

        this.emit(onEvent, { type: "thinking", phase: "stop" });

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
