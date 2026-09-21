# prompt-sections

Adds the owner's material to two of pi's stock system prompt sections and
leaves the rest of pi's construction alone. Needs pi 0.86 or later, where the
prompt is built from named sections.

- `<tools>` gains the local CLI roster: the `## Advertised` bullets of
  `~/.agents/system-tools-index.md`, keeping only names found on PATH.
- `<rules>` loses the rules listed in
  `~/.agents/kit/guidance/prompt/rules-drop.txt` and gains the text of
  `~/.agents/kit/guidance/prompt/RULES.md`. Either file may be absent.

Both files are read on every prompt, so an edit takes effect on the next one.
On a model that accepts mid-conversation system messages the edit arrives as
a patch of that one section.

## How it works

On `before_agent_start` the handler takes the `<tools>` and `<rules>` bodies
from `event.systemPrompt`, pi's own rendering of the live tool set, edits
them, and sets `options.sections.tools` and `options.sections.rules`. A
section set under a stock name replaces that section where it sits. Tools
added or removed by other extensions flow through without a change here.

## Limits

- A custom prompt (`SYSTEM.md`, `--system-prompt`) or a forced one makes pi
  skip its stock sections, so the handler does nothing.
- When pi's `<tools>` or `<rules>` wrapper is missing from the rendering, the
  stock prompt ships unchanged and the session shows one warning.
- A handler that runs later and edits `toolGuidelines` or `promptGuidelines`
  has no effect on `<rules>`; this extension loads last in the kit manifest
  for that reason.
- A tool toggled in the middle of a run leaves the two sections one prompt
  behind: pi re-renders its own sections then, and this handler runs again
  on the next prompt.

## Tests

```bash
node --test lib.test.ts local-tools.test.ts
```
