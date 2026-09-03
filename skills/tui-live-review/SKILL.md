---
name: tui-live-review
description: "Use when TUI behavior (rendering, resize handling, streaming feel, input response) needs the owner's eyes on a real terminal during a review round."
disable-model-invocation: true
---

# TUI live review: herdr pane API

Use this when TUI behavior (rendering, resize handling, streaming feel, input response)
needs the owner's eyes on a real terminal while the agent drives and observes. The agent
spawns a pane in the herdr session the owner is already attached to. Both see the
identical screen, and the agent drives and reads it over the socket API. Synchronization
is deterministic (`wait-output` with regex + timeout) instead of sleep-and-capture
polling. The invocation covers the observation-and-findings loop. Code changes between
rounds ride the session's normal rules rather than this skill's authority.

## Preconditions

- Running inside a herdr session, meaning `HERDR_ENV=1` and `HERDR_PANE_ID` are set and
  `herdr status` shows a compatible server. Without these, stop and tell the owner,
  because this skill has no non-herdr fallback.
- `jq` on PATH, because the helper scripts parse the CLI's JSON with it.
- Helper scripts live in `scripts/` next to this file. Resolve them to absolute paths
  against this skill's directory before use, because the agent's cwd during a review is
  the project under test. Prefer them over raw CLI calls, since they encode the guard
  checks and quoting rules below.

## CLI ground rules

Before the first raw CLI call, read `references/herdr-cli.md`, the versioned runbook of
verified syntax and traps for the installed herdr. The helper scripts already encode its
rules. The runbook matters when driving the CLI directly, and its compatibility header
says whether it still applies after a herdr upgrade.

## Setup (agent)

1. Create an evidence directory for the run.
2. Spawn the app in a sibling pane of the owner's workspace: `scripts/spawn.sh -e
   <evidence> -- <command...>` → prints the pane id. It splits with `--no-focus` (the
   owner keeps their keyboard), writes the quoted launch wrapper to
   `<evidence>/launch.sh`, and runs it. To let the owner start the app themselves, pass
   `-s`. The wrapper invocation is then typed at the pane's prompt but not executed, and
   the owner presses Enter. The split lands in the agent's own tab without stealing focus,
   so the owner is not necessarily looking at it. Compare `focused_pane_id` from `herdr
   pane layout --pane <id>` and tell the owner which pane and tab to switch to before
   driving anything. `spawn.sh` returns when the wrapper starts rather than when the app
   has painted. Before the first `drive.sh`, wait on something only the app's rendered
   first frame contains: `herdr pane wait-output <id> --source visible --regex <pat>
   --timeout <ms>`.
3. Start the recorder before first interaction, in the background: `scripts/record.sh
   <pane-id> <evidence> [interval-seconds]` (default 0.25s). It polls the rendered screen
   and writes a snapshot whenever the frame's sha256 changes, under
   `<evidence>/rec/<run-stamp>/`. That directory holds `NNNN.visible.ansi`,
   `NNNN.recent.txt`, and an `index.tsv` with columns `seq epoch_ms recent_lines sha`
   (`recent_lines = -1` means the read failed). Launch it detached and keep the pid:
   `nohup scripts/record.sh <pane> <evidence> >> <evidence>/rec.log 2>&1 &` `echo $! >
   <evidence>/rec.pid` It exits on its own when the pane disappears. Otherwise stop it
   with `kill $(cat <evidence>/rec.pid)`. Check `rec.log` once mid-review, because a dead
   recorder is silent. For true byte-level capture use the app's own `--record` flag (see
   last section).
4. If the app supports a debug side-channel, enable it. Prefer file-gated logging (`touch
   /tmp/<app>-debug.enable` → app appends to `/tmp/<app>-debug.log`). It can be toggled
   mid-run without relaunching and survives the owner replacing the pane. `herdr pane
   split --env KEY=VALUE` will seed the pane's shell environment if a variable is the only
   switch the app has, but it dies with the pane.

## Observing (agent)

- What the owner sees right now: `herdr pane read <id> --source visible`. Consider this
  the current ground truth.
- Wait for state deterministically: `herdr pane wait-output <id> --regex <pat> --timeout
  <ms>`. It searches the existing snapshot immediately, then polls. Always set
  `--timeout`. `--match <text>` waits on a literal substring instead.
- Geometry and attachment: `herdr pane get <id>` (`scroll.viewport_rows`) and `herdr pane
  layout --pane <id>`. Bare `pane layout` reports the focused tab rather than the pane
  under review.
- History-pollution metric: recent-text line count before vs after an interaction.
  `record.sh` logs it per snapshot, and unchanged means clean. Always read with an
  explicit `--lines N` bound, because bare `--source recent` returns a short window (~80
  lines) that saturates and makes any busy pane look clean.
- Clean-slate protocol between builds: quit the app, relaunch via a fresh `spawn.sh` pane,
  and close the old one. A fresh pane has empty scrollback, so every line is attributable
  to the current run.
- Headless stimulus batteries (resize storms, snapshot sweeps) belong in their own
  throwaway pane or tab.

## Driving (agent)

- **Guard every keystroke.** Send input only through `scripts/drive.sh <pane-id>
  <expected-process> keys|text ...`. It checks `pane process-info` and refuses to send
  unless the expected binary is the pane's foreground process at check time. Re-check
  after any owner interaction. Key names are listed by `herdr pane send-keys -h`, and
  `esc` is canonical.
- Announce intent before driving keys. Close panes the agent spawned freely (`herdr pane
  close <id>`), but any pane the owner created or took over is theirs.
- Mid-review owner messages can race queued commands, so re-read the pane and re-decide
  rather than continuing a stale plan.
- The owner may grab the keyboard at any time. After any owner interaction, re-check
  `process-info` and re-read before resuming.

## Evidence and assertions

- Snapshot everything the moment something interesting happens with `scripts/snapshot.sh
  <pane-id> <evidence> <label>`, which saves visible text, visible ANSI, recent text,
  recent-unwrapped text, process info, and pane geometry in one timestamped directory.
- The `record.sh` series supports append-only/stability checks across time and rendering
  diffs between consecutive snapshots.
- Grep captured screen text for single-word needles only, or read `--source
  recent-unwrapped`, because line wrapping splits multi-word phrases and produces false
  failures.
- Compare against a reference app in the same venue before concluding anything
  venue-sensitive. Venue behavior (herdr's terminal vs direct terminal scrollback/reflow
  handling) can dominate what looks like app behavior.

## Close out

A completed review has:

- the evidence directory with its snapshot/recording series,
- a findings list tied to snapshot paths,
- the owner's own observations recorded beside the agent's,
- the recorder shut down (`kill $(cat <evidence>/rec.pid)` unless it exited with its
  pane), and
- every agent-spawned pane closed.

Whether findings turn into fix work is the owner's call.

## Designing the demo binary for this workflow

Build observability into the artifact under test:

- `--record FILE`: tee every output byte in-app. This is now the only true byte-stream
  capture (herdr has no pipe-pane equivalent). The snapshot series shows rendered outcomes
  rather than escape-sequence traffic.
- A pacing/speed multiplier so headless batteries run fast while the owner's runs feel
  realistic.
- A deterministic scripted scenario (canned transcript) so every run is comparable and
  assertions are stable.
- File-gated debug telemetry (see Setup 4) for internal decisions the byte stream can't
  show (e.g., measured vs predicted geometry).
