# web-tools

Two tools for the root agent: `web_search` over a chain of keyed search
providers, and `web_fetch` over plain HTTP. `/web-tools` shows the chain and
which providers the session has given up on.

## Configuration

`~/.config/rpiv-web-tools/config.json` (the path predates this extension and
is shared with `agent-delegate`, whose research children read the same keys):

```json
{
  "provider": "brave",
  "apiKeys": { "brave": "...", "tavily": "...", "serper": "..." },
  "requestTimeoutSeconds": 30
}
```

Providers: `brave`, `tavily`, `exa`, `firecrawl`, `serper`. A provider's
environment variable (`BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`,
`FIRECRAWL_API_KEY`, `SERPER_API_KEY`) overrides its config key, and
`WEB_SEARCH_PROVIDER` overrides `provider`. Edit the file to change keys;
there is no in-app key entry.

## web_search

The chain is `provider` first, then the other keyed providers in the order
above. A search walks the chain until a provider answers:

- A provider that is out of quota or rejects its key is skipped for the rest
  of the session. When every provider is marked that way, all are tried again.
- A rate limit, outage, or timeout falls through to the next provider without
  being remembered.
- The result says so when it came from a fallback, and why the earlier
  providers were skipped.

The optional `provider` parameter tries one provider first for a single call.
It is offered only when more than one provider has a key.

An empty answer to a query with exact-phrase quotes or a `site:host/path`
filter is retried once on the same provider with the quotes and the path
removed, and the result says which query it answers. In the root sessions'
logs through September 2026 (1,429 searches), plain queries came back empty 0
to 1 percent of the time, quoted ones 26 to 57 percent, and `site:` with a
path 35 percent. The retry costs one request, which the model would otherwise
spend on its own second attempt.

## web_fetch

HTML is reduced to text: scripts, styles, and the head are dropped, headings
and list items get a marker, and `<pre>` keeps its line structure inside a
fence. JSON is re-indented so truncation cuts on a line instead of returning
nothing for a one-line body. Binary content types and bodies over 8 MB are
refused with a pointer to bash.

`links: true` keeps link targets as `[text](url)`, with same-site targets
written as paths. Links are opt-in because they cost a median 3.4 KB per page
(p90 19 KB) across 60 pages earlier sessions had fetched. `raw: true` returns
the body unconverted.

Output over 50 KB is cut at a line break and the full text is saved under the
system temp directory; the result names the file. Literal private and loopback
hosts are refused.

## Layout

- `index.ts`: tool and command registration, including the prompt text the
  model sees.
- `lib.ts`: config, the provider table, the chain walk, HTML conversion, and
  the fetch. No pi imports.
- `lib.test.ts`: unit tests against a fake `fetch`. Run
  `node --test lib.test.ts` in this directory (Node 22.18+).

Adding a provider is one entry in `PROVIDERS` in `lib.ts`.

## Provenance

A rewrite of `rpiv-web-tools` from
[juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono) (MIT), which
this replaces; the provider request shapes and the host guard are adapted
from it (Copyright (c) 2026 juicesharp). Dropped: the five providers the owner
held no key for (You.com, Jina, Perplexity, SearXNG, Ollama), provider-native
fetch endpoints, the GitHub clone interceptor, the interactive key picker,
and config-driven prompt text.
