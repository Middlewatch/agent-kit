# Skills

Agent skills for any harness.

Each top-level directory is one skill. Pi loads this directory through the
kit package (`package.json` declares `./skills`); `~/agent-kit/claude/skills`
and `~/agent-kit/codex/skills` are tracked links onto it. Adding, renaming, or
editing a skill needs no relinking.

See [`AUTHORING.md`](AUTHORING.md) for general recommendations for how to write your own skills

## Deployment

Everything here is global: pi loads the kit as a package, and the `claude/`
and `codex/` harness directories link `skills` here. A skill meant for one
workspace lives in that workspace's own `.claude/skills`, `.pi/skills`, or
`.agents/skills` instead.
