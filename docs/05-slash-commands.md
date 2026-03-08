---
title: Slash Commands
description: Built-in slash commands, how they behave, and how they fit into the REPL workflow.
---

# Slash Commands

Creed CLI includes a practical slash command system for actions that should not go through the language model as normal prompts.

## Available commands

Current built-in commands:

- `/help`
- `/clear`
- `/resume`
- `/model`
- `/exit`
- `/quit`

## `/help`

Shows the list of built-in slash commands and short descriptions.

## `/clear`

Clears the terminal screen and redraws the welcome area without destroying the active session state.

## `/resume`

Opens the saved-session picker in interactive mode. In non-interactive mode it resumes the latest saved session.

Interactive picker behavior:

- loads saved conversations for the current workspace
- highlights one entry at a time
- supports arrow navigation
- resumes the selected conversation on `Enter`

## `/model`

Lets you browse available models or directly switch the active model.

Examples:

```text
/model
```

```text
/model gpt-4.1-mini
```

If one partial match is found, the CLI switches to it. If several models match, it asks you to refine the selection.

## `/exit` and `/quit`

Both commands close the session. They are aliases of the same action.

## Autocomplete and selection behavior

The input box supports real-time slash command handling:

- slash hints appear while typing
- `Tab` completes commands
- arrow keys can move between command suggestions
- `Enter` can accept a selected suggestion

## Why slash commands exist

Some operations are local UI actions, not model tasks. Slash commands keep those actions deterministic, fast, and separate from LLM token usage.

## Busy-state restrictions

While the model is actively processing a prompt, certain slash commands are temporarily blocked to avoid mixed-state issues. Exit commands remain available.
