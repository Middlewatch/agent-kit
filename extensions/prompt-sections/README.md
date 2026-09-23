# prompt-sections

Edits two of pi's stock system prompt sections in place and leaves the rest
of pi's construction alone. Needs pi 0.86 or later, where the
prompt is built from named sections.

- `<tools>` gains the local CLI roster: the `## Advertised` bullets of
  `~/.agents/system-tools-index.md`, keeping only names found on PATH.
- `<rules>` loses the rules listed in `~/.agents/rules-drop.txt`, which may
  be absent or empty.

`bin/install` links the drop list from the kit's `guidance/`, beside
`AGENTS.md`. The owner's own rules live in `AGENTS.md`, which every harness
reads; this extension adds no rules of its own.

Both files are read on every prompt, so an edit takes effect on the next one.
On a model that accepts mid-conversation system messages the edit arrives as
a patch of that one section.

## /sysprompt

Opens a scrollable overlay of the system prompt (TUI only).

- Once the session has a turn, it shows the sections pi recorded in the
  transcript: every extension's sections, in the order sent, plus a
  `changes` tab listing each mid-session patch and tool change.
- Before the first turn, it shows pi's rendering of the loaded inputs with
  this extension's two overrides applied. Sections other extensions add on
  `before_agent_start` (pi-scratchpad's `<scratchpad>`) appear after the
  first turn.
- The `sources` tab lists section sizes, the loaded context files, and the
  two input files.

An extension that forces a whole prompt string makes pi send that string
while the transcript keeps the structured sections, so the view would not
match; nothing in the kit does that.

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
node --test lib.test.ts local-tools.test.ts   # no install needed
npm install && npm test                        # adds the viewer test (needs pi-tui)
npm run typecheck
```
