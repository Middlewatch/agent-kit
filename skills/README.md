# Skills

Agent skills for Claude Code, Codex and Pi, kept together in the kit because
they share nothing but a release cadence.

Each top-level directory is one skill. Harnesses consume them through the
`~/.agents/skills` directory, which `bin/install` links to this directory: pi
and Codex read it natively, and `~/.claude/skills` and `~/.codex/skills` are
links onto it. Adding, renaming, or editing a skill needs no relinking.

See [`AUTHORING.md`](AUTHORING.md) for the intent card, document shape, rigidity
rules, reference lifecycle, and verification used when creating or revising a
skill.

## Deployment

Everything here is global through `~/.agents/skills`. A skill meant for one
workspace lives in that workspace's own `.claude/skills`, `.pi/skills`, or
`.agents/skills` instead. Pi discovers a directory that contains `SKILL.md`
as one skill and does not descend into it, so a nested variant (today
`deep-research/pi/`) is declared in the kit's `package.json` `pi.skills`.
