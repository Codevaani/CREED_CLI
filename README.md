# cursorcli

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts chat
```

Settings can be configured at:

- workspace: `.creed/settings.json`
- user: `%USERPROFILE%\\.creed\\settings.json`

Workspace settings override user settings, and environment variables override both.

The CLI now requires these runtime values before `chat` starts:

- `runtime.baseUrl`
- `runtime.apiKey`
- `runtime.model`

Example:

```json
{
  "runtime": {
    "baseUrl": "http://localhost:20128/v1",
    "apiKey": "your-api-key",
    "model": "your-model-name"
  },
  "shell": {
    "enableUnsafeCommands": false
  },
  "webSearch": {
    "maxResults": 5
  },
  "ui": {
    "showShellStatusLine": true,
    "animateNonInteractiveThinking": true,
    "ctrlCConfirmTimeoutMs": 2000
  }
}
```

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
