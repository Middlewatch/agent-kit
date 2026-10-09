# Locations

`~/agent-kit/` is the kit checkout and the one install target on a machine.
Beside the kit's own components it holds a flat set of symlinks, one per named
location, pointing at wherever that location lives on this machine, and one
state directory per harness. `bin/install` creates the bindings from
`deployments.json`; a machine may add more and list them in
`~/agent-kit/MACHINE.md`. Agents and docs refer to a location by its
`~/agent-kit/<name>` path and never by where it resolves, so the same
instruction works on every machine.

## The kit itself

`~/agent-kit/guidance/`, `skills/`, `extensions/`, `tools/`, `bin/`, read by
`~/agent-kit/...` path.

Edit in place, commit, and let `bin/install` and `bin/check` keep the
deployment honest. Keep machine facts and owner identifiers out of tracked
files; `bin/check --lint` enforces it with the patterns in the untracked
`bin/forbidden.local.txt`. The untracked machine files (`MACHINE.md`,
`system-tools-index.md`, `verification-toolbox.md`) sit at the root beside the
bindings, gitignored by name.

## Harness directories

`~/agent-kit/pi`, `~/agent-kit/claude`, `~/agent-kit/codex`: each harness's
config and state directory, selected by its environment variable
(`PI_CODING_AGENT_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Git tracks only the
links into the kit (`AGENTS.md` or `CLAUDE.md`, `skills`); credentials,
sessions, caches, and settings live there untracked.

Harnesses write their own state here. Agents edit pi's `settings.json` through
pi's own commands or `bin/install`, and never commit anything from these
directories.

## Bindings

Each entry states what the binding holds, then its write contract.

### `~/agent-kit/wiki`

The knowledge base curated by the owner and agents together: lanes by
directory, note format per the wiki repo's own `OKF_PROFILE.md`, gated by the
wiki repo's `bin/lint-wiki`.

Research reports file here per the `deep-research` skill; everything else
enters through inbox triage with the owner in the loop. Notes are durable
reference: no phase codes, packet ids, or temporary status language. The
`walkthrough` skill keeps its tutorial records in `personal/tutorials/`.

### `~/agent-kit/inbox`

Capture drop-box, a tracked directory inside the wiki repo: one observation
per file, from any agent or machine.

Any agent may drop notes; the `inbox-triage` skill is the only consumer,
promoting or deleting each note with the owner. The kit's `bin/check` warns
when notes pass 30 days untriaged.

### `~/agent-kit/journals`

Session capture from the separately installed `autojournal` extension:
per-turn episodes, append-only, machine-local, untracked.

Written by the autojournal capture adapter; agents read through its
`memory_search` tool or grep and leave episodes unedited.

### `~/agent-kit/reference`

Reference material agents read before writing: coding-language packs
(`coding-languages/<lang>/`), each with `CONVENTIONS.md` and toolchain
references.

`~/agent-kit/reference` is one git repo and each pack is a directory under
`coding-languages/`. Additions go through the `harvest` skill with the code
that proves the finding.

### `~/agent-kit/projects`

The owner's development workspace. Each slug is the git repo itself with its
unversioned surround in a gitignored `<slug>/.local/`, per
`~/agent-kit/skills/project-scaffold/references/project-layout.md`.

Every repo carries a `.gitignore` with sane defaults (phase documents,
scratch, caches, secrets stay out). Several agents may work the same repo at
once: parallel work goes in scratch directories or worktrees and merges on
completion; a dirty worktree is committed by the next worker or flagged for
the owner. New projects are private until the owner says otherwise. The rules
for software work are the `projects` overlay
(`~/agent-kit/guidance/workspaces/projects/AGENTS.md`), which `bin/install`
links to `~/agent-kit/projects/AGENTS.md`.

## Other roots

Other roots (third-party reference checkouts, day-job work, research,
experiments, archives, model weights, datasets) are machine-specific and are
described in `~/agent-kit/MACHINE.md`, which is untracked; see
`MACHINE.md.example` for the template. A workspace root that wants its own
standing instructions takes an `AGENTS.md` (plus `CLAUDE.md -> AGENTS.md`);
`workspaces/` holds the owner's overlays as examples.
