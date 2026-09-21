# pi-tui

The owner's TUI layer for pi: legible tool output, a labeled footer, a
fade-glyph header with estate facts, a glanceable todo widget,
transcript-backed copy in fullscreen mode, and `/edit` into neovim on
real paths. Spec:
`docs/specs/2026-08-30-pi-tui.md` in the kit repo.

## What it changes

- **Tool rendering.** Pi's four default tools (`bash`, `read`, `edit`,
  `write`) render gutter-style with no background
  fill: a status-glyph header (`●`/`◌`), output lines behind a dim `│`
  gutter, and a closing `╰` line with status, duration, and hidden-line
  count. Execution still delegates to the built-in implementations.
  `grep`, `find`, and `ls` are left unregistered, so they stay inactive as
  in stock pi; the models that used them reached for `rg`/`ls` in bash
  over 95% of the time anyway.
- **Footer.** Three labeled lines: location (cwd, `⎇` branch, session
  name), session (`model`, `think`, `ctx … of …`, `in`, `out`, `hit`,
  cost), and extensions (each `setStatus` value labeled with its
  extension key, and a status naming its own extension sheds the prefix).
- **Header.** A centered pi glyph (solid roof, legs dissolving through
  shade blocks) over the workspace, branch, and estate counts (skills,
  extensions, inbox notes). Filesystem counts refresh asynchronously every
  30 seconds; the header shows cached values while a read is pending.
- **Progress widget.** Derived from the assistant's own replies, so it
  costs no tool calls: markdown task-list lines (`- [ ] slice`, `- [x]
  slice`, `- [-] slice (skip: reason)`) in assistant text become items keyed
  by their text, latest status wins. Above the editor it shows a settled
  count plus up to four open items, flags a skip with no reason, and clears
  when the next user message arrives after every item has settled. The
  list rebuilds from the session branch on start, resume, and fork.
- **Working indicator.** The glyph's shade blocks breathe in accent.
- **Transcript copy.** In fullscreen mode, a mouse selection copies what
  the transcript holds rather than what the screen shows: fenced code
  blocks come back as their markdown source (no message margin or
  code-block indent, wrapped lines rejoined, tabs kept), prose loses its
  margin, and gutter tool output loses the `│ ` bar. pi's own
  `fullscreenCopyOnSelect` setting and `Ctrl+X` keep working, and any row
  the layer cannot resolve copies as pi renders it.
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

## Themes

`themes/modus-vivendi-tinted.json` and `themes/ef-dark.json` map all pi
color tokens from Protesilaos Stavrou's published modus-vivendi-tinted
and ef-dark palettes; `deployments.json` links them into
`~/.pi/agent/themes/` so `/settings` can select them and edits hot
reload.

## Probes

Two live commands verify terminal behavior no unit test can:
`/pitui-probe-scroll` (1 Hz status ticks, so scroll into history and
watch for viewport yanks) and `/pitui-probe-suspend` (suspend, edit a
scratch file, resume).

## Tests

```bash
npm test            # line builders, discovery, delayed header refresh, and selection extraction
npm run typecheck
```

The copy layer's live check: in fullscreen mode, drag across an indented
code block and paste; the lines should carry only their own indentation.

Design notes in `DESIGN.md`.
