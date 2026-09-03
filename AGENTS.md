# Agent kit repository

One portable repo behind the `~/.agents` convention. Components:
`guidance/` (the global guide, Claude adapter, charters under `workflows/`,
workspace overlays), `skills/`, `extensions/` (pi), `tools/`, and `bin/`
(`install`, `check`). `deployments.json` is the link table `bin/install`
reads; `README.md` explains the convention and the install.

## Change contract

- Cross-component references are written against `~/.agents/...`
  (`~/.agents/kit/guidance/workflows/<name>.md`, `~/.agents/wiki/...`).
  Within a component, plain relative paths to its own files. No `..` crossings.
- No tracked file names a machine, an absolute home path, or a sibling
  checkout. `bin/check --lint` is the gate; `bin/lint-exempt.txt` lists the
  history directories it skips. Machine facts live in the untracked
  `~/.agents/MACHINE.md`.
- Always-loaded files (`guidance/AGENTS.md`, `guidance/CLAUDE.md`,
  `guidance/workspaces/*/AGENTS.md`, this file) stay at or under 240 lines;
  procedures go into skills or linked documentation.
- `guidance/workflows/` charters are imported by absolute `~/.agents/kit/...`
  path from project `AGENTS.md` files across the projects binding. Before
  renaming or moving one, find and update every importer
  (`rg -l 'kit/guidance/workflows/' ~/.agents/projects --glob '!*.git'`).
- Skills are served by the `~/.agents/skills -> kit/skills` link; the pi
  manifest (`package.json`) declares extensions plus the one skill variant pi
  cannot discover on its own. Tools build from their own directory with the
  command in `deployments.json`; a missing toolchain skips the tool.
- Each tool and extension keeps its own README, tests, and design doc in its
  directory; `tools/README.md` and `extensions/README.md` are the indexes.

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
