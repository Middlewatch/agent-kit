# 0009: The kit checkout is the install target; harnesses point at it by environment variable

Date: 2026-10-09
Status: accepted

## Context

The kit was deployed through two layers of symlinks: a `~/.agents` binding
directory linking to a checkout under `~/projects`, and each harness's
dot-directory (`~/.pi/agent`, `~/.claude`, `~/.codex`) linking into
`~/.agents`. One repo meant three places to look, an installer whose main job
was keeping the link table true, and a publication path (npm package) nobody
used. Pi, Claude Code, and Codex each accept an environment variable naming
their config directory, which removes the need for the harness links
altogether.

## Decision

The clone lives at `~/agent-kit` and is the one install target. The bindings
(`wiki`, `journals`, ...) are gitignored symlinks at its root. Each harness
gets a subdirectory (`pi/`, `claude/`, `codex/`) selected by
`PI_CODING_AGENT_DIR`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME`; git tracks only
the relative links into the kit there, and the harness writes its state
beside them untracked. `~/.agents`, the harness dot-directories, and the npm
publication path are retired; `bin/install` migrates their contents once.

## Consequences

One clone per machine, `git pull && bin/install` to update, and the harness
links travel with the repo instead of with an installer. The kit's own `bin/`
and `tools/` rule out making the root itself pi's agent directory, and pi and
Claude Code both name their config `settings.json`, so the subdirectories are
the shape that avoids collisions. The cost: every reference to `~/.agents/...`
in the kit, the wiki, and project guides had to be rewritten to
`~/agent-kit/...`, the harness variables must be set before the harness
starts (a missing variable silently starts pi fresh at `~/.pi/agent`), and
tools that spelled `~/.pi/agent` now read the variable.

## Considered options

- Point `PI_CODING_AGENT_DIR` at the root itself: collides with the kit's
  `bin/` and `tools/` (pi's managed-binary and tools directories) and would
  auto-discover seven of ten extensions a second time beside the package.
- Keep `~/.agents` and only move the clone: no convention rewrite, but the
  dot-directories and the two-layer link table stay.
