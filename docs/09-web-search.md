---
title: Web Search
description: How the built-in web search tool works, when to use it, and how it is configured.
---

# Web Search

Creed CLI includes a built-in `web_search` tool for current information lookup.

## Why web search exists

Some tasks require fresh or external information, for example:

- checking up-to-date package details
- comparing model providers
- verifying APIs or services
- answering current-knowledge questions

## Default backend

Current default endpoint:

```text
https://html.duckduckgo.com/html/
```

This can be changed through settings.

## Configuration

Example:

```json
{
  "webSearch": {
    "endpoint": "https://html.duckduckgo.com/html/",
    "maxResults": 5
  }
}
```

## How the tool is used

The model can call `web_search` with a search term. The executor fetches results, extracts useful fields, and returns a compact result set back into the conversation.

## When to use it

Use web search when:

- the answer may have changed recently
- the topic depends on live external data
- the user asks for current information
- the user wants references or links

## Safety advantage

Compared with arbitrary shell commands, web search is a much narrower capability. It lets the model retrieve external information without granting full system command access.

## Future improvements

This system could later grow into:

- multi-source search
- richer source rendering
- freshness controls
- per-query result limits
- optional scraping follow-up
