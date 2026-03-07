import { Command } from "commander";
import pc from "picocolors";
import { startRepl } from "./repl";

const program = new Command();

program
  .name("ai-cli")
  .description("Natural language coding CLI")
  .version("0.1.0");

program
  .command("chat")
  .description("Start the interactive coding REPL")
  .action(() => {
    console.log(pc.blue("🚀 Starting AI Coding CLI..."));
    console.log(pc.gray("Type 'exit' or 'quit' to stop.\n"));
    startRepl();
  });

program.parse();
