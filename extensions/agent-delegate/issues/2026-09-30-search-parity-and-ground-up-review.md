# Open: child web search has fallen behind `web-tools`; inputs for a ground-up review

**Filed:** 2026-09-30, after the `web-tools` extension replaced the
`rpiv-web-tools` fork.

**Status:** Not scheduled. The owner wants to review the delegate tool from
the ground up and simplify it, so the gap below is recorded as input to that
review rather than patched now.

## Two search implementations

Research children search through `src/web.ts`. The root agent searches
through the kit's `web-tools` extension (`~/agent-kit/extensions/web-tools`).
The two share only the config file, `~/.config/rpiv-web-tools/config.json`.
The kit's change contract forbids imports across extensions, which is why the
code was not shared.

On 2026-09-30 the child chain changed from serper, brave, tavily to the
configured provider first, then brave, tavily, serper (commit `bc9bf56`).
Nothing else in the child search changed.

## What the children lack

- **Relaxed retry.** `web-tools` retries an empty quoted or `site:host/path`
  query once with the constraint removed. In root-session logs plain queries
  came back empty 0 to 1 percent of the time, quoted ones 26 to 57 percent,
  and `site:` with a path 35 percent. A child gets `(no results)` and spends
  a turn on its own second attempt.
- **Memory of a dead provider.** A child walks the chain on every search, so
  a provider that is out of quota costs one failed request per search, and
  every new child rediscovers it. `web-tools` remembers it for the session.
- **Exa and Firecrawl.** The child chain knows three providers; `web-tools`
  knows five.
- **JSON and links in `web_fetch`.** The child passes JSON through as one
  line and strips every link target. `web-tools` re-indents JSON and keeps
  links on request.

## Why it matters

Children ran 1,272 searches in September 2026 against 227 from root sessions,
a median of 14 per research delegation (p90 34, max 54). Any search
improvement that stops at the root tools reaches about 15 percent of the
searches.

## Options for the review

1. Port the retry and the skip memory into `src/web.ts`. Small, and keeps two
   implementations.
2. Have the child load the kit's `web-tools` extension and keep only the
   boundary here: the capability allowlist, the scan annotation, and the
   provenance ledger, applied from the `tool_result` hook. One implementation,
   at the cost of reworking the hardened fetch (redirect cap, per-hop host
   guard, byte caps) or moving those into `web-tools`.

## Size of the tool itself

Measured from a request payload on pi 0.99.2 with codemode active, `delegate`
is the largest tool the root model is sent: 1,571 bytes of description, 2,350
bytes of codemode declaration appended by pi, and 2,774 bytes of schema, 6.7
KB in all. Through the Claude CLI provider a description longer than 2,048
characters arrives cut at that length (seen on `delegate` and `codemode`), so
that model sees the description and the first 477 bytes of the declaration,
ending mid-comment.
