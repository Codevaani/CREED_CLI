---
title: Getting Started
description: Install dependencies, launch the CLI, and understand the first successful run.
---

# Getting Started

This guide gets Creed CLI running locally and explains what to expect during the first session.

## Requirements

Before running the project, make sure you have:

- Bun installed
- a compatible API endpoint
- a valid API key
- at least one model name that your endpoint supports

## Install dependencies

From the project root:

```bash
bun install
```

## Run the CLI

Start the interactive mode with:

```bash
bun run index.ts chat
```

If runtime configuration is already available, the REPL opens immediately. If runtime configuration is missing, the CLI launches the setup wizard first.

## First successful launch

After setup succeeds, the CLI shows:

- workspace path
- current git branch
- shell status
- the interactive input area

From there you can start asking questions about the repo or use slash commands.

## Useful first prompts

Try these once the REPL is open:

```text
explain the project architecture
```

```text
what tools are available in this workspace
```

```text
show me how session resume works
```

```text
/help
```

## Non-interactive behavior

When the CLI is not attached to a TTY, it cannot open the interactive setup wizard. In that case it falls back to a plain missing-config error and tells you which values are not set.

## Recommended first checks

After your first successful run, verify:

1. the selected provider is correct
2. the model responds successfully
3. `/model` lists the models you expect
4. `/resume` shows saved conversations after one completed turn

## Common startup commands

Install:

```bash
bun install
```

Start chat:

```bash
bun run index.ts chat
```

Show CLI help:

```bash
bun run index.ts --help
```

## Next reading

To understand runtime config in detail, continue to `03-configuration.md`.
