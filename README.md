# CREED CLI

CREED CLI is a Bun-based natural language coding assistant that runs inside your terminal. It is built for interactive project work: reading code, editing files, resuming sessions, switching models, and working against OpenAI-compatible or Anthropic-compatible runtimes from a local configuration file.

## What It Does

- Starts an interactive coding REPL with a custom terminal UI
- Guides first-time users through runtime setup when required config is missing
- Supports OpenAI-compatible and Anthropic-compatible providers
- Lets users switch models from inside the CLI with `/model`
- Stores chat history in user-level SQLite for resume flows
- Includes slash commands for help, clear, resume, model switching, and exit
- Exposes local file tools and web search, with unsafe shell execution disabled by default

## Current Status

This project is an active local CLI app, not a polished package release yet. The codebase already includes the REPL, setup wizard, runtime client, session storage, tools manifest, and documentation, but the primary development flow is still local:

- install dependencies
- configure runtime credentials
- run `bun run dev`

## Requirements

- [Bun](https://bun.sh) installed
- A compatible model backend
- API credentials for that backend

Supported runtime modes:

- `openai-compatible`
- `anthropic-compatible`

## Install

```bash
bun install
```

## Run

Development entrypoint:

```bash
bun run dev
```

Direct chat command:

```bash
bun run chat
```

Explicit command form:

```bash
bun run index.ts chat
```

Full CLI help:

```bash
bun run index.ts --help
```

## First Run Setup

When you start chat without runtime config, CREED CLI opens an interactive setup wizard in TTY mode. The wizard lets you:

1. choose a provider
2. enter `baseUrl`, `apiKey`, and `model`
3. test the connection with a simple request
4. save the working configuration

Saved user runtime settings go to:

```text
%USERPROFILE%\.creed\settings.json
```

Saved MCP server entries go to:

```text
%USERPROFILE%\.creed\mcp.json
```

If the app is started in a non-interactive context and config is missing, it exits early with a clear runtime configuration error instead of trying to open the wizard.

## Configuration

Settings can be read from:

- workspace: `.creed/settings.json`
- user runtime settings: `%USERPROFILE%\.creed\settings.json`
- user MCP servers: `%USERPROFILE%\.creed\mcp.json`

Priority order:

1. default values
2. user runtime settings
3. user MCP settings
4. workspace settings
5. environment variables

Required runtime fields before chat can start:

- `runtime.baseUrl`
- `runtime.apiKey`
- `runtime.model`

`runtime.provider` is still important, but it defaults to `openai-compatible` when not explicitly set.

Example:

```json
{
  "runtime": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:20128/v1",
    "apiKey": "your-api-key",
    "model": "your-model-name"
  },
  "shell": {
    "enableUnsafeCommands": false
  },
  "webSearch": {
    "endpoint": "https://html.duckduckgo.com/html/",
    "maxResults": 5
  },
  "ui": {
    "showShellStatusLine": true,
    "animateNonInteractiveThinking": true,
    "ctrlCConfirmTimeoutMs": 2000
  }
}
```

User-level MCP servers live in a separate file:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {},
      "enabled": true
    }
  }
}
```

Supported environment variable overrides:

- `CREED_BASE_URL`
- `CREED_API_KEY`
- `CREED_MODEL`
- `CREED_ENABLE_UNSAFE_COMMAND_TOOL`
- `CREED_WEB_SEARCH_ENDPOINT`
- `CREED_WEB_SEARCH_MAX_RESULTS`

Compatibility aliases also exist for some OpenAI-style env vars in runtime settings resolution.

## Slash Commands

The interactive REPL currently supports:

- `/help` to show available commands
- `/clear` to clear the terminal view
- `/resume` to open the session picker and restore a saved conversation
- `/model` to pick or switch the active model
- `/exit` to close the session
- `/quit` to close the session

The input UI also supports:

- arrow key navigation for command and picker flows
- tab completion for slash commands
- double `Ctrl+C` confirmation before closing

## Top-Level Commands

CREED CLI now exposes a larger command surface from the root binary:

- `chat` starts the interactive coding REPL
- `login` opens the runtime setup flow
- `logout` removes saved user runtime credentials
- `mcp` lets you add, list, remove, and inspect external MCP servers

MCP entries saved by the CLI are written to `%USERPROFILE%\.creed\mcp.json`.

Useful MCP commands:

```bash
bun run index.ts mcp list
bun run index.ts mcp add github npx -y @modelcontextprotocol/server-github
bun run index.ts mcp tools github
bun run index.ts mcp remove github
```

## Sessions And Resume

Conversation data is stored at the user level, not inside workspace settings:

```text
%USERPROFILE%\.creed\sessions.sqlite
```

This allows:

- resuming old conversations
- workspace-aware session filtering
- a session picker for `/resume`

The runtime settings file stays JSON, while session data uses SQLite.

## Tools And Safety

The tool layer is manifest-driven. The active manifest used by the runtime lives at:

```text
src/tools/tools.json
```

Core tool behavior includes:

- file read, edit, replace, and delete operations scoped to the workspace
- web search support
- optional unsafe shell tool gating

Unsafe shell execution is off by default. It only becomes available when explicitly enabled through configuration or environment overrides.

## Web Search

The CLI includes a `web_search` tool backed by a configurable endpoint. By default it uses DuckDuckGo HTML search. Search settings are controlled through:

- `webSearch.endpoint`
- `webSearch.maxResults`

This is intended for quick result fetching inside the agent loop, not full browser automation.

## Project Structure

High-level layout:

```text
src/
  agent/          orchestration loop and tool execution flow
  config/         settings loading, merge, validation, and persistence helpers
  repl/           interactive UI, output rendering, command handling, session picker
  runtime/        provider-specific request handling
  setup/          first-run setup wizard
  system_prompt/  base prompt file
  tools/          tool loading, manifest, and executor
docs/             public-facing product docs
```

Main entrypoints:

- `index.ts`
- `src/index.ts`

## Development Notes

- The package is Bun-first and uses TypeScript
- The app is launched through Commander
- The REPL is custom-rendered for terminal interaction instead of using a browser UI
- Session persistence and setup are already integrated into the runtime flow

Useful commands:

```bash
bun install
bun run dev
bun run chat
bun x tsc --noEmit
```

## Documentation Map

Detailed docs live in `docs/`:

- `docs/01-overview.md`
- `docs/02-getting-started.md`
- `docs/03-configuration.md`
- `docs/04-first-run-setup.md`
- `docs/05-slash-commands.md`
- `docs/06-model-selection.md`
- `docs/07-sessions-and-history.md`
- `docs/08-tools-and-safety.md`
- `docs/09-web-search.md`
- `docs/10-architecture.md`
- `docs/11-troubleshooting.md`

## Troubleshooting

If chat does not start:

- check that `runtime.baseUrl`, `runtime.apiKey`, and `runtime.model` are set
- verify the selected provider matches the backend you are calling
- run `bun x tsc --noEmit` to catch TypeScript issues
- confirm your user settings file exists at `%USERPROFILE%\.creed\settings.json`

If `/resume` does not show expected conversations:

- confirm session data exists in `%USERPROFILE%\.creed\sessions.sqlite`
- make sure the saved session belongs to the current workspace

If the shell tool does not appear:

- that is expected unless unsafe commands are explicitly enabled

## License / Release Notes

No formal package publishing or release workflow is documented in this repository yet. If this project is going public, the next recommended steps are:

1. add a license
2. clean generated session data from version control
3. add contribution and release notes
4. tighten README examples around safe public setup
