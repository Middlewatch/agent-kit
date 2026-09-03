# pi-scratchpad design

**Status: as built (2026-08-23).**

## Problem

Shared skills and the global guide tell agents to run gates through a script
that writes full output to the scratchpad and prints a short summary. Claude
Code provides a scratchpad natively. Pi had no referent for the word, and the
same skill tree is linked into every harness.

The instruction rests on a measurement. Across two weeks of build sessions,
build runs reached a 290K median context and 470K p90 because gate output
accumulated in the transcript, and one such session was 21% of a week's entire
model spend. Offloading bulky output is the cheapest fix available, but only if
the offload target exists.

## Shape

```
<base>/<project-slug>/<session-id>/scratchpad/
```

- **`<base>`**: `PI_SCRATCHPAD_BASE`, else `${XDG_CACHE_HOME:-~/.cache}/pi-scratchpad`.
- **`<project-slug>`**: the absolute cwd with separators replaced by `-`, e.g.
  `-home-user-projects-example`. This is deliberately identical to Claude
  Code's convention so a human reading either tree recognizes it.
- **`<session-id>`**: the harness session identifier, rejected if it contains
  a path separator or `..`.

### Why `~/.cache` rather than `/tmp`

On many Linux systems `/tmp` is tmpfs, i.e. RAM. On the development host,
Claude Code's own scratch base under `/tmp` was already holding 1.9G resident
when this was designed. A feature whose entire purpose is to attract large gate
logs and raw command output does not belong in RAM, least of all on a host that
runs local inference where memory is the contended resource. `~/.cache` is
disk-backed by convention.

The tradeoff is that `~/.cache` survives reboot while tmpfs does not, which is
why the reaper is in scope rather than deferred.

### Expiry

Expiry is age-based, default 7 days (`PI_SCRATCHPAD_TTL_DAYS`, where `0`
disables sweeping), and is checked opportunistically when a session resolves
its own path, with no timer unit and no daemon. A session never reaps its own
directory.

Every rule in the sweeper fails towards keeping data, because the cost of a
wrong deletion is somebody's working state and the cost of a wrong retention is
disk. A directory is removed only when all four hold:

- **It has the shape this extension creates**: a `scratchpad` child inside
  `<base>/<project>/<session>`. This is the ownership test that bounds the blast
  radius. Without it, a `PI_SCRATCHPAD_BASE` pointed at a home directory or a
  repository would make every two-level subdirectory a deletion candidate.
- **No live process claims it.** Each session writes its pid to `.owner` beside
  the scratchpad and removes it at shutdown. A session that sits open and
  untouched past the TTL is therefore safe. A stale pid that happens to match a
  running process only causes a directory to be kept.
- **Nothing inside was modified within the TTL, at any depth.** Directory mtime
  alone is not enough, because appending to `scratchpad/logs/gate.log` bumps no
  parent's mtime, so a session writing steadily into a subdirectory would look
  idle. The
  walk stops at the first sign of life and only runs for trees that already look
  stale; a tree too deep or too large to scan is treated as active.
- **It is not the live session's own directory.**

One race is knowingly accepted. Another session could write into a candidate
between the freshness check and the removal. Closing it needs locking that the
"no daemon, no timer" shape does not justify for scratch data with a 7-day floor.

A session that starts and never writes has its empty tree removed at shutdown,
so merely launching pi does not accumulate litter.

Seven days is an initial guess (see the limits below).

### How the agent learns the path

The path reaches the agent through two channels and no tool:

- **`$PI_SCRATCHPAD`** in every bash command. Pi's bash tool builds its child
  environment by spreading `process.env` at spawn time, so setting the variable
  at `session_start` reaches every command without overriding the bash tool or
  colliding with `pi-interlock`.
- **A system-prompt bullet** rendered by the prompt owner. sysprompt-editor
  fills its `{{PI_SCRATCHPAD}}` placeholder from `process.env.PI_SCRATCHPAD`
  on every `before_agent_start`. This extension no longer appends its own
  section. Extension load order is filesystem readdir order, so an append
  here could land before or after the template splice and either duplicate
  the bullet or leave the placeholder unfilled. Publishing the path at
  `session_start`, which fires before any `before_agent_start`, has no
  ordering dependence. When the editor stands down (custom SYSTEM.md, drifted
  stock shape), the environment variable and `/scratchpad` are the channels.

A registered tool was rejected because its schema would sit in the context
window of every session forever, and the existing `bash`/`write` tools already
write files given a path. The cost of the feature is therefore one bullet in the cached
prefix, matching how Claude Code pays for the same concept.

## Structure

- **Path core**: `src/paths.ts`, pure resolution and expiry policy.
- **Directory layer**: `src/directory.ts`, create at mode 0700, sweep, prune.
- **Extension**: `src/index.ts`, wiring the environment variable, the
  opportunistic sweep, and `/scratchpad`.
- **Install doc**: `PI_INSTALL.md`.

## Limits

- The sweep is age-only. A single build session can write hundreds of
  megabytes, and no size bound exists, so `PI_SCRATCHPAD_TTL_DAYS` is the only
  knob.
- The path convention is shared with Claude Code by construction, and any other
  harness that wants the same convention reimplements it in its own language.
  The convention is tested here, in `tests/paths.test.ts`.
