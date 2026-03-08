---
title: Architecture
description: Internal module layout, execution flow, and how the main parts of the CLI fit together.
---

# Architecture

Creed CLI is structured as a small set of focused modules instead of one giant runtime file.

## Main entrypoint

File:

```text
src/index.ts
```

Responsibilities:

- parse CLI commands
- validate runtime readiness
- launch setup when required
- start the REPL when configuration is valid

## Setup layer

File:

```text
src/setup/wizard.ts
```

Responsibilities:

- provider selection
- base URL, API key, and model entry
- connection test flow
- save runtime settings to user JSON

## REPL layer

Files:

- `src/repl/index.ts`
- `src/repl/commands.ts`
- `src/repl/output.ts`

Responsibilities:

- terminal rendering
- input box management
- slash command detection
- `/resume` and `/model` pickers
- output formatting
- interactive and non-interactive mode handling

## Orchestrator layer

File:

```text
src/agent/orchestrator.ts
```

Responsibilities:

- maintain conversation history
- inject the system prompt
- request model responses
- handle tool call loops
- emit structured UI events back to the REPL

## Runtime layer

File:

```text
src/runtime/client.ts
```

Responsibilities:

- OpenAI-compatible request handling
- Anthropic-compatible request handling
- connection testing
- provider-aware model listing

## Tool layer

Files:

- `src/tools/index.ts`
- `src/tools/executor.ts`
- `src/tools/tools.json`

Responsibilities:

- load enabled tools
- filter unsafe tools by settings
- execute file and web operations
- serialize tool results back into the conversation

## Storage layer

Settings:

- `%USERPROFILE%\.creed\settings.json`
- `.creed/settings.json`

Sessions:

- `%USERPROFILE%\.creed\sessions.sqlite`

## High-level request flow

1. user enters a prompt
2. REPL submits it to the orchestrator
3. orchestrator sends history to the runtime client
4. model may answer directly or request a tool
5. tool executor runs the requested action
6. result goes back into history
7. model produces the final response
8. REPL renders the transcript and saves the session
