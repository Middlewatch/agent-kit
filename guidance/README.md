# Guidance

The model-facing instruction layer of the kit. Every file an agent loads
globally or reads by reference lives here, so a stray instruction is edited in
one place instead of traced across the filesystem. `bin/install` links the
guide and adapter into each client through `~/.agents/`; everything else here
is read by `~/.agents/kit/...` path or linked by hand where it applies.

## AGENTS.md: the global guide

Loaded into every agent session through the `~/.agents/AGENTS.md` symlink.
Pi and Codex are linked to it directly and Claude Code reaches it through the
`CLAUDE.md` adapter's import. If you forked the
kit, this file is yours: it describes the owner who wrote it, so rewrite it
front to back to describe yourself. Write it by hand and let agents edit it
sparingly, if at all. Use it to seed behavior preferences and the instructions
that should apply to every project and task on your machine.

Two gates keep it honest, enforced by `bin/check --lint`: it stays at or under
240 lines (procedures belong in skills or linked docs), and it carries no
absolute home path or pattern listed in the untracked `bin/forbidden.local.txt`
(machine names, sibling checkouts). Machine facts go in the untracked
`~/.agents/MACHINE.md`.

Project-level `AGENTS.md` files live in their own repos rather than here. Use them
sparingly and keep them to the bare minimum context an agent needs when it
loads inside that workspace.

## CLAUDE.md: harness adapter

Claude Code's entry point. It imports the shared guide with
`@~/.agents/AGENTS.md` and adds only Claude-specific notes. Add a sibling
adapter here if another harness needs one; keep shared policy in AGENTS.md.

## LOCATIONS.md and the .example templates

`LOCATIONS.md` defines the required bindings under `~/.agents/` (`kit`, `wiki`,
`inbox`, `journals`, `reference`, `projects`) and the write contract for each. Agents
read it before writing outside the current repo.

Three templates seed untracked files that agents read from `~/.agents/`
directly. Copy each by hand (`cp guidance/MACHINE.md.example
~/.agents/MACHINE.md`) and fill it in; `bin/install` does not create them.
The filled copies stay untracked on purpose: they carry the identifiers and
machine facts this public-ready tree keeps out.

- `MACHINE.md.example` -> `~/.agents/MACHINE.md`: hostnames, hardware,
  mounts, services, and extra roots that differ per machine.
- `system-tools-index.md.example` -> `~/.agents/system-tools-index.md`: the
  installed tool roster with when-to-reach-for-it notes, trial-verified
  caveats, and the deliberately-not-installed list. Agents maintain it as
  installs and trials land.
- `verification-toolbox.md.example` -> `~/.agents/verification-toolbox.md`:
  the tool roster for verification tasks, per capability (property testing,
  fuzzing, snapshots, performance budgets), with the precedents that earned
  each tool its place. Skills and project guides read the filled copy when
  planning gates and harnesses.

## workspaces/: overlays for workspace roots

One directory per workspace root that wants standing instructions. Each holds
that root's `AGENTS.md`. The `projects` overlay carries the rules for software
work (git habits, language packs, committed tests) so the global guide stays
domain-free; `deployments.json` links it into the `projects` binding with a
`CLAUDE.md -> AGENTS.md` companion, so it travels with the kit. The other
overlays (research, experiments, day-job work) describe machine-specific roots,
so link them by hand (`ln -s ~/.agents/kit/guidance/workspaces/research/AGENTS.md
~/research/AGENTS.md` plus a relative `CLAUDE.md -> AGENTS.md` companion in
the root). Managing the overlays here keeps every workspace instruction in one
editable place. Which roots exist on a given machine is a `MACHINE.md` fact.

## rules-drop.txt: pi's stock rules

`AGENTS.md` is the one rule set, read by every harness. The only pi-specific
file beside it is `rules-drop.txt`, linked into `~/.agents/` by `bin/install`:
the `prompt-sections` extension removes each stock rule it names, one per
line, from pi's `<rules>` section, so a stock line that pulls against the
guide ("Be concise", "ask whenever underspecified") stops reaching the model.
Claude Code and Codex keep their own system prompts and read the guide alone.
