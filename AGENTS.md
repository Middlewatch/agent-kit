# Agent kit repository

One portable repo that is also its own install target, `~/agent-kit`.
Components: `guidance/` (the global guide, Claude adapter, workspace
overlays), `skills/`, `extensions/` (pi), `tools/`, `bin/` (`install`,
`check`), and one state directory per harness (`pi/`, `claude/`, `codex/`;
tracked links only, state gitignored). `deployments.json` is the table
`bin/install` reads; `README.md` explains the layout and the install.

## Change contract

- Cross-component references are written against `~/agent-kit/...`
  (`~/agent-kit/skills/<name>/SKILL.md`, `~/agent-kit/wiki/...`).
  Within a component, plain relative paths to its own files. No `..` crossings.
- No tracked file names a machine, an absolute home path, or a sibling
  checkout. `bin/check --lint` is the gate; `bin/lint-exempt.txt` lists the
  history directories it skips. Machine facts live in the untracked
  `~/agent-kit/MACHINE.md`.
- Always-loaded files (`guidance/AGENTS.md`, `guidance/CLAUDE.md`,
  `guidance/workspaces/*/AGENTS.md`, this file) stay at or under 240 lines;
  procedures go into skills or linked documentation.
- Pi loads the kit as a local package: the pi manifest (`package.json`)
  declares extensions, prompts, and skills. Claude Code and Codex reach the
  skills through the tracked `claude/skills` and `codex/skills` links. Tools
  build from their own directory with the command in `deployments.json`; a
  missing toolchain skips the tool.
- Each tool and extension keeps its own README, tests, and design doc in its
  directory; `tools/README.md` and `extensions/README.md` are the indexes.
  Read `~/agent-kit/wiki/platform/index.md` before extension or harness work; it
  holds the verified pi runtime findings (compaction, hooks, TUI, providers).

## Gates

```bash
bin/check                    # install state on this machine
bin/check --lint             # tracked tree: paths, hosts, line budgets
python3 tests/test_check.py  # installer and checker against the fixture kit
```

Tool suites run in their directories (`zig build test`, `go test ./...`,
`tests/run.sh`). Run the three gates above after any change to `bin/`,
`deployments.json`, or an always-loaded file.

## Voice

The kit is public-ready: prose names roles (`the owner`, `the user`) except in
`guidance/AGENTS.md`, which is the owner's own guide and may name him.
`bin/check --scan <repo>` is the owner-string scan for other repos bound for
publication; its patterns live in the untracked `bin/forbidden.local.txt`.
