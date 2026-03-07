import readline from "readline";
import pc from "picocolors";
import { Orchestrator } from "../agent/orchestrator";

export function startRepl() {
  const orchestrator = new Orchestrator();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const updatePrompt = () => {
    rl.setPrompt(pc.green(`[${orchestrator.getMode()}] > `));
  };

  updatePrompt();
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (input === "exit" || input === "quit") {
      console.log(pc.yellow("Goodbye!"));
      process.exit(0);
    }

    if (input) {
      try {
        await orchestrator.processUserInput(input);
      } catch (err) {
        console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      }
    }

    updatePrompt();
    rl.prompt();
  }).on("close", () => {
    console.log(pc.yellow("Goodbye!"));
    process.exit(0);
  });
}
