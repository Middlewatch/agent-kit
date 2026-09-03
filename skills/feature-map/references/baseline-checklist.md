# Baseline checklist by product kind

Read in charting step 4. Pick the kind, then bring every item the owner's dump did not
cover to them in prose, a few at a time, with what it means and the industry default. Each
item ends as a row, a non-goal, or a typed open row. The owner rules; the agent explains.

These are the features a first-week user hits whether or not anyone planned them. A
charting session from a prose dump misses them reliably, because the owner lists what
they want, not what they assume.

## Any product

- First run: what the user sees with no config, no data, no network.
- Settings: where they live, how they are edited, how they move between machines.
- Errors and notifications: how a failure reaches the user and how loud it is.
- Crash and recovery: what survives an unclean exit.
- Upgrade: what happens to stored data when the format changes.
- Uninstall and data location: where state lives, what removing it deletes.
- Logging and diagnostics: what the user can hand to a debugging session.
- Accessibility and scale: font size, high DPI, color contrast, keyboard-only use.
- Offline and network: what needs a connection and what does not.
- Performance budgets: startup, memory, the one hot path.

## Text editor or IDE

- Unsaved changes: prompt, autosave, swap files, recovery after crash.
- External modification: a file changes on disk while open, clean and dirty cases.
- Encoding and line endings: detection, preservation on save, BOM, invalid bytes.
- Large and binary files: what degrades and what refuses to open.
- Clipboard: system clipboard, internal registers, history.
- Multiple cursors or selections: in or out, since it changes the selection type.
- Search and replace: in buffer, across project, regex, case, whole word, preview.
- Find file by name, open from a pasted path with line and column.
- Undo model: linear, branching, persisted across restarts.
- Keybinding layers: which chords a terminal pane swallows, which the editor takes,
  what differs between GUI and terminal surfaces.
- Language tooling lifecycle: server discovery, start, restart, failure reporting,
  per-language settings, formatting on save.
- Syntax highlighting and folding.
- Git: what beyond status, stage, commit, and diff (branches, pull, push, blame, log,
  conflicts).
- Terminal: shell selection, working directory rules, scrollback, exit handling.
- Sessions and projects: what reopens as it was, what is remembered per project.
- Themes and fonts: ligatures, fallback fonts, per-surface differences.
- Snippets, auto-pairs, indentation rules, trailing whitespace, final newline.
- Spell check and word wrap for prose files.
- Debugger: in, out, or open.
- Extensibility: plugin system, scripting, or owner-only code (a non-goal is a valid
  answer and should be written down).

## CLI tool

- Help and usage text, exit codes, `--version`.
- Config precedence: flags, environment, file, defaults.
- Output modes: human, JSON, quiet, color and TTY detection.
- Input: stdin, files, globs, what happens with none.
- Dry run, verbose, force.
- Shell completion.
- Signals and interruption: what a Ctrl-C leaves behind.

## Daemon or service

- Start, stop, restart, reload without restart.
- Health and readiness, what a supervisor sees.
- Logs: where, rotation, levels.
- Client protocol and its versioning.
- Concurrency limits and backpressure.
- Auth and who may connect.
- Data directory, migrations, backup.
- Shutdown ordering and in-flight work.

## Knowledge or task tool

- Capture: the fastest path from thought to stored item.
- Views: today, overdue, by tag, by project, search.
- Recurrence, deadlines, reminders.
- Links and backlinks, dangling link reports.
- Archive and delete, what is recoverable.
- Import and export, the plain-text story.
- Sync between machines and conflict handling.

## Coding agent harness

- Slash commands as a system: model, thinking, compact, settings, help, new, resume, fork,
  usage, theme, keymap, copy; whether user prompt templates register as commands.
- Context and cost meter: context used against the window, tokens this turn, session cost,
  cache hit rate, visible without asking.
- Mid-session model and thinking switch: continue in place or fork.
- File references in the composer: `@path` completion, clipboard image paste.
- Edit rewind: undo the last N turns' file changes (a non-goal is a common answer; it
  breaks the cache).
- Background long-running tool calls with streamed output.
- Hooks: user commands at lifecycle points (before tool, after edit, turn end, session start).
- MCP client: consuming third-party servers, in, out, or via the extension lane.
- Git awareness: branch and dirty state in the status bar, a session diff, a commit command.
- Session naming and search: auto titles, rename, full-text search from the picker.
- Clipboard over ssh (OSC 52) and copy-a-code-block.
- External modification: a file the agent edited changes on disk before the next edit.
- Large and binary files: truncation bound, notice, refusal.
- Permission UX: "always allow this prefix" for session or forever, a grants view, the
  current mode visible.
- Cost guardrails: per-session or per-day spend ceiling.
- Turn-complete notification: bell or desktop, and what it means headless.
- Provider parity: every provider the owner uses elsewhere, plus a local model lane for
  offline work.
- Sessions outliving the terminal: an intermediary (tmux, dtach, systemd) or a daemon; the
  daemon assumption reshapes the ownership model, so rule out the intermediary first.

## Adding a kind

Add a section when a charting session for a new product kind finds items the owner did
not list and would have wanted. Keep each item to one line: the feature, and what makes
it a first-week hit.
