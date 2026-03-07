import { Command } from "commander";
import pc from "picocolors";
import { startRepl } from "./repl";

const program = new Command();

program
  .name("creed-cli")
  .description("Natural language coding CLI")
  .version("0.1.0");

program
  .command("chat")
  .description("Start the interactive coding REPL")
  .action(() => {
    startRepl();
  });

program.parse();
