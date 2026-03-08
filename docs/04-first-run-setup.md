---
title: First Run Setup
description: Interactive setup flow for missing runtime config, including provider selection, testing, and saving.
---

# First Run Setup

Creed CLI includes a first-run setup wizard that appears automatically when required runtime settings are missing.

## When the wizard appears

The wizard opens when any of these values is missing:

- `runtime.baseUrl`
- `runtime.apiKey`
- `runtime.model`

This only happens in interactive TTY mode. In non-interactive mode, the CLI prints a configuration error instead.

## Setup flow

The setup process has two main stages:

1. provider selection
2. credentials and model entry

## Stage 1: Provider selection

You can choose between:

- `OpenAI compatible`
- `Anthropic compatible`

This setting determines the request format used during chat, the request format used for connection testing, and the endpoint used when fetching models.

## Stage 2: Runtime fields

After choosing a provider, the wizard asks for:

- `baseUrl`
- `apiKey`
- `model`

The API key field is masked in the terminal UI.

## Actions

At the bottom of the setup screen you get two actions:

- `Test`
- `Continue`

### Test

`Test` sends a small real request using the values you entered.

Current behavior:

- sends a `hello` message
- uses the chosen provider format
- verifies that the endpoint, key, and model are valid enough to return a response

### Continue

`Continue` saves the runtime settings only after the current form has passed `Test`.

Saved destination:

```text
%USERPROFILE%\.creed\settings.json
```

## Keyboard behavior

In the wizard:

- `Up` / `Down` moves through provider options or form focus
- `Tab` moves to the next field or action
- `Enter` confirms provider selection or runs the focused action
- `Esc` goes back or cancels setup
- `Ctrl+C` exits setup
