---
title: Tools and Safety
description: The tool system, enabled capabilities, workspace protections, and why shell access is disabled by default.
---

# Tools and Safety

Creed CLI uses structured tools instead of unrestricted direct actions. This gives the model controlled capabilities while keeping the trust boundary narrower than free-form shell access.

## Core tools

The tool layer currently exposes these core capabilities:

- `read_file`
- `list_dir`
- `edit_file`
- `search_replace`
- `delete_file`
- `web_search`

These tools are loaded by default for normal coding tasks.

## Optional shell tool

The shell execution tool exists, but it is not enabled by default.

Config key:

```json
{
  "shell": {
    "enableUnsafeCommands": false
  }
}
```

## Workspace safety

The project is tightened so file operations stay scoped to the workspace. This matters because coding assistants often become risky when path traversal or arbitrary shell access is left unchecked.

## Why structured tools are useful

Structured tools make the agent:

- easier to reason about
- easier to debug
- safer by default
- more predictable for repeated tasks

## Edit patterns

The project supports both:

- full file rewrites through `edit_file`
- targeted in-place edits through `search_replace`

## Why shell remains off by default

Shell execution creates a much larger safety surface:

- file deletion risk
- package install side effects
- network operations
- process management issues
- environment leakage

For that reason, Creed CLI treats command execution as an explicit opt-in capability.
