import pc from "picocolors";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { loadTools } from "../tools";
import { executeTool } from "../tools/executor";

export class Orchestrator {
  private history: any[] = [];
  private tools: any[];
  private mode = "code" as const;
  private openai: OpenAI;

  constructor() {
    this.tools = loadTools();
    
    // Initialize OpenAI client pointing to the local proxy
    this.openai = new OpenAI({
      baseURL: "http://localhost:20128/v1",
      apiKey: "sk-a38e6e6069fafa20-3vygfk-f0c95695",
    });

    this.initSystemPrompt();
  }

  public getMode() {
    return this.mode;
  }

  private async initSystemPrompt() {
    let systemMessage = "";
    try {
      const promptPath = path.join(__dirname, "..", "system_prompt", "Agent_Prompt.txt");
      systemMessage = await fs.readFile(promptPath, "utf-8");
    } catch (e) {
      systemMessage = `You are an AI coding agent. You write code, refactor applications, and fix bugs autonomously. You have access to various tools to navigate the codebase, search, read files, and write code. Use them to complete user tasks effectively.`;
      console.log(pc.yellow("\n[Warning: Could not load Agent_Prompt.txt, using default code prompt instead.]\n"));
    }

    // Reset history and set code-mode system prompt
    this.history = [{
      role: "system",
      content: systemMessage,
    }];
  }

  async processUserInput(input: string) {
    // The Agent_Prompt explicitly looks for <user_query> tags to know what the user wants to do.
    const formattedInput = `<user_query>\n${input}\n</user_query>`;

    this.history.push({ role: "user", content: formattedInput });
    
    console.log(pc.gray(`[Thinking as ${this.mode} agent...]`));
    
    let isFinished = false;

    while (!isFinished) {
      try {
        const requestOptions: any = {
          model: "kr/claude-haiku-4.5",
          messages: this.history,
          stream: true, // Force streaming
        };

        // In 'code' mode, we inject the tools defined in tools.json
        if (this.tools.length > 0) {
          requestOptions.tools = this.tools.map(tool => ({
            type: "function",
            function: tool
          }));
        }

        const stream = await this.openai.chat.completions.create(requestOptions as any) as any;
        
        let fullContent = "";
        let toolCalls: any[] = [];

        // Type guard in case the proxy returns a raw string despite stream: true
        if (typeof stream === 'string') {
          const lines = (stream as string).split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) fullContent += delta.content;
              } catch (e) {}
            }
          }
          if (fullContent) console.log(pc.cyan(`\n${fullContent}\n`));
        } else {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              if (!fullContent) process.stdout.write(pc.cyan("\n"));
              process.stdout.write(pc.cyan(delta.content));
              fullContent += delta.content;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: "",
                    type: "function",
                    function: { name: "", arguments: "" }
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
          if (fullContent) console.log("\n");
        }

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

        // If the model wants to call tools
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add the assistant's tool call message to history to maintain conversation state
          this.history.push(assistantMessage);

          for (const tc of assistantMessage.tool_calls) {
              console.log(pc.magenta(`\n⚙️ Executing: ${tc.function.name} (ID: ${tc.id})`));
              
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch (e) {
                console.log(pc.red(`Failed to parse arguments: ${tc.function.arguments}`));
                parsedArgs = {};
              }

              // Actually execute the tool!
              const result = await executeTool(tc.function.name, parsedArgs);
              
              console.log(pc.gray(`  Result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`));

              this.history.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.function.name,
                content: result
              });
          }
          
          console.log(pc.gray("\n[Sending tool results back to LLM...]\n"));
          // Loop will continue and send the history back to the model
        } else {
          // Normal text response, no tools requested -> finished
          this.history.push({ role: "assistant", content: assistantMessage.content });
          isFinished = true;
        }

      } catch (error: any) {
         console.error(pc.red(`\nLLM API Error: ${error.message}\n`));
         // If it fails, remove the user message so they can try again
         this.history.pop();
         isFinished = true; // Break out of the loop
      }
    }
  }
}
