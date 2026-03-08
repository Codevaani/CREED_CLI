---
title: Overview
description: What Creed CLI is, how it works, and what problems it solves.
---

# Creed CLI Overview

Creed CLI is a terminal-first coding assistant built for local development workflows. It lets you talk to your codebase in natural language, inspect files, edit project content, run structured tools, and keep the conversation scoped to the current workspace.

The project is intentionally small and focused. Instead of trying to be a general-purpose desktop app, Creed CLI concentrates on a fast interactive REPL, provider-compatible model access, safe file operations, session persistence, and a workflow that feels close to modern AI coding tools.

## What Creed CLI does

Creed CLI can:

- read files inside the current workspace
- list folders and inspect project structure
- make targeted edits and full file rewrites
- delete files when requested
- search the web through a built-in web search tool
- persist conversations and resume previous sessions
- switch models without restarting the app
- guide first-time setup through an interactive configuration wizard

## Core product shape

At a high level, the CLI is split into a few practical layers:

- startup layer
- REPL layer
- orchestrator layer
- runtime layer
- tool layer
- storage layer

## Main user flows

The most important flows are:

### First run

If `baseUrl`, `apiKey`, or `model` is missing, the CLI opens a setup wizard instead of failing silently. The user chooses a provider type, enters credentials, tests them with a real `hello` request, and saves them to `%USERPROFILE%\.creed\settings.json`.

### Daily usage

The user runs:

```bash
bun run index.ts chat
```

Then they can:

- ask about architecture
- request code changes
- use slash commands like `/help`, `/resume`, and `/model`
- resume previous work from saved session history

### Switching providers or models

The runtime is compatible with:

- OpenAI-compatible APIs
- Anthropic-compatible APIs

Models can be switched through the `/model` command without rebuilding the project.

## Current strengths

Creed CLI is strongest in these areas:

- fast local setup
- terminal-native UX
- provider compatibility
- session continuity
- safety-oriented defaults
- direct codebase interaction through tools

## Current boundaries

This project is still a CLI product, not a full desktop IDE replacement. It does not currently ship:

- a plugin marketplace
- GUI windowed editor panels
- advanced policy profiles per tool
- full multi-agent orchestration
- web-hosted account management

## Where to go next

If you are new to the project, read these docs next:

1. `02-getting-started.md`
2. `03-configuration.md`
3. `04-first-run-setup.md`
4. `05-slash-commands.md`
