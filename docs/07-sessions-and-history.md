---
title: Sessions and History
description: How conversations are saved, resumed, listed, and migrated.
---

# Sessions and History

Creed CLI stores chat sessions so users can resume ongoing work instead of starting from scratch every time.

## What is persisted

Each saved session includes:

- session id
- workspace path
- saved timestamp
- short preview text
- user turn count
- full conversation history

## Storage format

Session history is stored in SQLite.

Database path:

```text
.creed/sessions.sqlite
```

## Why SQLite was introduced

JSON files work for early prototypes, but they become messy over time:

- too many individual files
- slower listing logic
- higher chance of invalid file content
- harder indexing and future querying

SQLite fixes that while keeping everything local.

## Legacy migration

Older session files from the previous JSON-based storage are migrated automatically when the session store is first opened.

Legacy paths:

- `.creed/sessions/latest.json`
- `.creed/sessions/entries/*.json`

## `/resume` behavior

In interactive mode:

- `/resume` opens a picker
- sessions are filtered to the current workspace
- the user can move through saved entries and resume one

In non-interactive mode:

- `/resume` restores the latest saved session

## Session preview generation

The session preview comes from the first user message in the conversation. It is collapsed into a short single-line label so the picker stays readable.

## Workspace scoping

Sessions are associated with the current working directory. This prevents unrelated project histories from mixing together.

## Future-friendly design

Because the store is now SQLite-based, the project can add session search, pinned sessions, archived sessions, tags, and export features later.
