---
title: Model Selection
description: Provider-aware model listing, switching, and the /model workflow.
---

# Model Selection

Creed CLI supports switching between multiple models through the `/model` command.

This feature is designed for users who want to:

- try a faster model for routine tasks
- switch to a stronger model for harder reasoning
- compare behavior across providers
- avoid restarting the CLI every time the model changes

## How `/model` works

The command uses the currently configured runtime provider and credentials to fetch the available models from your API. The model list is not hardcoded. It comes from the actual endpoint you configured.

## Interactive usage

Run:

```text
/model
```

In interactive mode, this opens a model picker inside the CLI UI.

You can:

- browse the returned models
- see which model is currently active
- move with arrow keys or `Tab`
- press `Enter` to switch
- press `Esc` to close

## Direct switching

You can also switch directly:

```text
/model gpt-4.1-mini
```

If the id matches exactly, the model is switched immediately.

## What changes after switching

When a model switch succeeds:

- the current REPL session updates immediately
- the orchestrator uses the new model on the next turn
- the selected model is written to `%USERPROFILE%\.creed\settings.json`

## Provider-specific behavior

### OpenAI-compatible

The CLI uses the provider's models endpoint through the OpenAI SDK model list call.

### Anthropic-compatible

The CLI uses the provider's models API in Anthropic-compatible format.

## Error cases

Model listing or switching may fail if:

- the API key is invalid
- the endpoint does not support model listing
- the provider returns no models
- the selected model id is not recognized

## Recommended workflow

Use a cheaper or faster model for browsing and small edits, and a stronger reasoning model for architecture work and complex refactors.
