# pi-scratchpad

A session-scoped scratch directory for Pi, matching the concept Claude Code
provides natively so that shared skills can say "the scratchpad" and have it
resolve on every harness.

See `DESIGN.md` for the decisions this is built against and `PI_INSTALL.md`
for installation and the smoke test.

## What a session gets

- `$PI_SCRATCHPAD` in the environment of every bash command.
- A system-prompt bullet naming the directory and what belongs in it, rendered
  by sysprompt-editor's `{{PI_SCRATCHPAD}}` placeholder from the same
  variable.
- `/scratchpad` to print the path.
- Session directories are reaped after 7 idle days, and an unused one is
  removed at shutdown rather than left behind.

## Why this exists

House skills are served to Claude Code, Pi, and Codex from one source. Several of them now tell the agent to keep
bulky output out of its transcript: write the full thing to a file, print a
short summary, cite the path. That instruction matters because cost tracks
context size times turn count, and transcripts that swallow gate output drift
to a 300K prefix where every further edit costs multiples of an early one.

The instruction names "the scratchpad," which is a Claude Code concept. On Pi it
resolves to nothing, so the agent improvises a temp path or skips the offload.
The alternatives were to hedge the wording in every skill that mentions a
working file (paying prompt tokens forever, in every session, to describe a
directory) or to make the concept real once. This is the second option.

## Design commitments

**Session-scoped rather than project-scoped.** The path includes the session id.
Concurrent agents in the same repo are normal here, and a shared per-project
scratch directory would reintroduce the collision problem that the one-writer
rule exists to prevent.

**Disk-backed rather than `/tmp`.** `/tmp` is often tmpfs, meaning RAM, and
the whole point of the feature is to attract large files. The default base is
therefore `${XDG_CACHE_HOME:-~/.cache}/pi-scratchpad`, overridable by
`PI_SCRATCHPAD_BASE` for anyone who wants the tmpfs behavior deliberately.

**Reaped by policy.** An auto-created directory that attracts large files and
is never swept is a disk-growth lane. Age-based expiry is part of the core
rather than a later add-on, and the reaper is a gate-tested behavior.

**No new third-party dependencies.** The toolchain is TypeScript, vitest, and
`@types/node`, with the Pi runtime as a peer dependency. Nothing here triggers
the `vet-dependency` checklist.

## Layout

- `src/paths.ts`: pure path resolution and expiry policy. It makes no
  filesystem writes, so it is cheap to test exhaustively.
- `src/directory.ts`: the filesystem layer (create at mode 0700, sweep expired
  sessions, prune an unused tree).
- `src/index.ts`: the Pi extension (environment variable, opportunistic
  sweep, `/scratchpad` command).
- `tests/`: unit tests for both layers, written before the code they guard.

```bash
npm install && npm test && npm run typecheck
```
