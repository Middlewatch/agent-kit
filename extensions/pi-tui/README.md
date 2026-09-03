# pi-tui

The owner's TUI layer for pi: legible tool output, a labeled footer, a
fade-glyph header with estate facts, a glanceable todo widget, and
`/edit` into neovim on real paths. Spec:
`docs/specs/2026-08-30-pi-tui.md` in the kit repo.

## What it changes

- **Tool rendering.** The seven built-in tools (`bash`, `read`, `edit`,
  `write`, `grep`, `find`, `ls`) render gutter-style with no background
  fill: a status-glyph header (`●`/`◌`), output lines behind a dim `│`
  gutter, and a closing `╰` line with status, duration, and hidden-line
  count. Execution still delegates to the built-in implementations.
- **Footer.** Three labeled lines: location (cwd, `⎇` branch, session
  name), session (`model`, `think`, `ctx … of …`, `in`, `out`, `hit`,
  cost), and extensions (each `setStatus` value labeled with its
  extension key, and a status naming its own extension sheds the prefix).
- **Header.** A centered pi glyph (solid roof, legs dissolving through
  shade blocks) over the workspace, branch, and estate counts (skills,
  extensions, inbox notes) read from `~/.agents`.
- **Todo widget.** It rides the todo tool's result details and shows a
  settled-count summary plus up to four open items above the editor.
- **Working indicator.** The glyph's shade blocks breathe in accent.
- **`/edit`.** A two-level picker over estate files: choose a root, then
  a file within it, typing to fuzzy-filter (esc clears the filter, then
  backs out to the roots). The roots are:
  - the skills
  - global and project prompt templates
  - the four canonical system prompt slots
  - any user-settings package shipping `guidance/sysprompt/*.md` (the
    kit's sysprompt-editor templates, so edits apply on the next message)
  - any folders mapped in the untracked `~/.pi/agent/pi-tui-edit.json`,
    for example `{"roots": [{"label": "wiki", "path": "~/.agents/wiki"}]}`

  Mapped folders are scanned recursively for markdown (dotdirs and
  `node_modules` skipped, depth and count capped), and the config file
  is itself a root. Selection opens `$VISUAL`/`$EDITOR`/nvim on the
  real path by suspending the TUI, and reloads the runtime when the
  file changed.

## Theme

`themes/modus-vivendi-tinted.json` maps all pi color tokens from the
published modus-vivendi-tinted palette; `deployments.json` links it
into `~/.pi/agent/themes/` so `/settings` can select it and edits hot
reload.

## Probes

Two live commands verify terminal behavior no unit test can:
`/pitui-probe-scroll` (1 Hz status ticks, so scroll into history and
watch for viewport yanks) and `/pitui-probe-suspend` (suspend, edit a
scratch file, resume).

## Tests

```bash
npm test            # vitest over the pure line builders and discovery
npm run typecheck
```

Design notes in `DESIGN.md`.
