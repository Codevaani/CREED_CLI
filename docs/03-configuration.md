---
title: Configuration
description: Runtime settings, precedence rules, and the exact configuration structure used by Creed CLI.
---

# Configuration

Creed CLI reads configuration from JSON files and environment variables. Runtime credentials stay in JSON because they are easy to inspect, easy to edit, and simple for users to back up.

## Required runtime fields

The CLI needs these values before chat can start:

- `runtime.baseUrl`
- `runtime.apiKey`
- `runtime.model`

It also tracks:

- `runtime.provider`

Supported values for `runtime.provider`:

- `openai-compatible`
- `anthropic-compatible`

## Settings locations

Creed CLI looks in two JSON locations:

- workspace settings: `.creed/settings.json`
- user settings: `%USERPROFILE%\.creed\settings.json`

The first-run setup wizard writes to the user file.

## Precedence order

Settings resolve in this order:

1. default values
2. user settings file
3. workspace settings file
4. environment variables

## Example configuration

```json
{
  "runtime": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4.1-mini"
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

## Runtime settings

### provider

Controls which API format the runtime client uses.

### baseUrl

The base endpoint for the configured provider.

### apiKey

The secret key sent with runtime requests.

### model

The active model used for chat turns. This value can also be changed later through `/model`.

## Environment variable overrides

The project also supports:

- `CREED_PROVIDER`
- `CREED_BASE_URL`
- `CREED_API_KEY`
- `CREED_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CREED_ENABLE_UNSAFE_COMMAND_TOOL`
- `CREED_WEB_SEARCH_ENDPOINT`
- `CREED_WEB_SEARCH_MAX_RESULTS`
- `CREED_SHOW_SHELL_STATUS_LINE`
- `CREED_ANIMATE_NON_INTERACTIVE_THINKING`
- `CREED_CTRL_C_CONFIRM_TIMEOUT_MS`

## Best practice

Use the setup wizard for user-level runtime credentials and keep workspace-level overrides only for team-specific defaults.
