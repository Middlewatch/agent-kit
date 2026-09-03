# Locations

`~/.agents/` is the binding directory: a flat set of symlinks, one per named
location, pointing at wherever that location lives on this machine.
`bin/install` creates the required bindings from `deployments.json`; a machine
may add more and list them in `~/.agents/MACHINE.md`. Agents and docs refer to a location by
its `~/.agents/<name>` path and never by where it resolves, so the same
instruction works on every machine.

| Binding | Holds | Write contract |
|---|---|---|
| `~/.agents/kit` | This repository: `guidance/` (the global guide, charters, workspace overlays), `skills/`, `extensions/`, `tools/`, `bin/`. | Edit in a checkout, commit, and let `bin/install` and `bin/check` keep the deployment honest. Keep machine facts and owner identifiers out of tracked files; `bin/check --lint` enforces it with the patterns in the untracked `bin/forbidden.local.txt`. |
| `~/.agents/wiki` | The knowledge base curated by the owner and agents together: lanes by directory, note format per the wiki repo's own `OKF_PROFILE.md`, gated by the wiki repo's `bin/lint-wiki`. | Research reports file here per the `deep-research` skill; everything else enters through inbox triage with the owner in the loop. Notes are durable reference: no phase codes, packet ids, or temporary status language. |
| `~/.agents/inbox` | Capture drop-box, a tracked directory inside the wiki repo: one observation per file, from any agent or machine. | Any agent may drop notes; the `inbox-triage` skill is the only consumer, promoting or deleting each note with the owner. The kit's `bin/check` warns when notes pass 30 days untriaged. |
| `~/.agents/journals` | Session capture from the separately installed `autojournal` extension: per-turn episodes, append-only, machine-local, untracked. | Written by the autojournal capture adapter; agents read through its `memory_search` tool or grep and leave episodes unedited. |
| `~/.agents/reference` | Reference material agents read before writing: coding-language packs (`coding-languages/<lang>/`), each with `CONVENTIONS.md` and toolchain references. | `~/.agents/reference` is one git repo and each pack is a directory under `coding-languages/`. Additions go through the `harvest` skill with the code that proves the finding. |
| `~/.agents/projects` | The owner's development workspace. Each slug is the git repo itself with its unversioned surround in a gitignored `<slug>/.local/`, per `~/.agents/kit/skills/project-scaffold/references/project-layout.md`. | Every repo carries a `.gitignore` with sane defaults (phase documents, scratch, caches, secrets stay out). Several agents may work the same repo at once: parallel work goes in scratch directories or worktrees and merges on completion; a dirty worktree is committed by the next worker or flagged for the owner. New projects are private until the owner says otherwise. |

Other roots (third-party reference checkouts, day-job work, research,
experiments, archives, model weights, datasets) are machine-specific and are
described in `~/.agents/MACHINE.md`, which is untracked; see
`MACHINE.md.example` for the template. A workspace root that wants its own
standing instructions takes an `AGENTS.md` (plus `CLAUDE.md -> AGENTS.md`);
`workspaces/` holds the owner's overlays as examples.
