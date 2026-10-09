# Projects workspace

This root (`~/agent-kit/projects`) is the owner's development workspace: each slug is
a git repo with its unversioned surround in a gitignored `<slug>/.local/`. The
write contract is the `~/agent-kit/projects` entry in
`~/agent-kit/guidance/LOCATIONS.md`; this overlay holds the rules for software
work, which apply in every repository below it.

## Contract

- Clean, performant, open source, understandable software is the goal.
- C, Zig, Go, and Lua are the owner's languages of choice; pick from them
  unless the task or the repository dictates otherwise.
- Git is an ordinary tool here: use it for progress and status tracking, write
  commit messages a human can read, and checkpoint, branch, or hand work between
  agents whenever that helps.
- Before writing or reviewing a language with a pack under
  `~/agent-kit/reference/coding-languages/<lang>/`, read its `CONVENTIONS.md` and
  any reference matching the installed toolchain.
- Commit tests only where the task asks for them or the repository already keeps
  tests for that kind of change, sized like the neighboring tests.

## Reach

`bin/install` links this file to `~/agent-kit/projects/AGENTS.md` with a
`CLAUDE.md -> AGENTS.md` companion. Pi and Claude Code read it from any directory
below the root. Codex stops at the git root, so a Codex user carries the same
text after the global guide in `~/agent-kit/codex/AGENTS.md`.
