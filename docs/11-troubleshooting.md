---
title: Troubleshooting
description: Common setup, runtime, model, session, and terminal issues with practical fixes.
---

# Troubleshooting

This guide covers the most common problems users hit while working with Creed CLI.

## The setup wizard does not appear

Possible reasons:

- the CLI is running in non-interactive mode
- stdin or stdout is not a TTY

Fix:

- run the CLI directly in a terminal
- avoid piping input during first-time setup

## Chat says runtime configuration is missing

Check that these fields exist:

- `runtime.baseUrl`
- `runtime.apiKey`
- `runtime.model`

## Test fails in the setup wizard

Possible reasons:

- wrong base URL
- wrong API key
- invalid model id
- provider type does not match the endpoint

Fix checklist:

1. confirm the provider type is correct
2. confirm the endpoint format is correct
3. verify the model really exists on that provider
4. run `Test` again after each change

## `/model` shows no models

Possible reasons:

- the provider does not expose a list endpoint
- the endpoint is compatible for chat but not for model discovery
- credentials are invalid

## `/resume` does not show expected history

Possible reasons:

- the session belongs to a different workspace
- the session has not been saved yet
- legacy JSON sessions have not been accessed from the current workspace path

## The terminal input feels jumpy

This is usually a terminal redraw behavior issue rather than model failure.

Try:

- using a normal terminal window instead of a constrained embedded terminal
- reducing window resizing during interaction
- using the latest code after recent input renderer fixes

## Shell commands are not available

That is usually expected. Shell execution is disabled by default.

## TypeScript compile fails after local changes

Run:

```bash
bun x tsc --noEmit
```

This is the fastest way to catch broken imports, type mismatches, or invalid structural changes.
