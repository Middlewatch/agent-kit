# Skills

Agent skills for any harness.

Each top-level directory is one skill. Harnesses consume them through the
`~/.agents/skills` directory, which `bin/install` links to this directory: pi
and Codex read it natively, and `~/.claude/skills` and `~/.codex/skills` are
links onto it. Adding, renaming, or editing a skill needs no relinking.

See [`AUTHORING.md`](AUTHORING.md) for general recommendations for how to write your own skills

## Deployment

Everything here is global through `~/.agents/skills`. A skill meant for one
workspace lives in that workspace's own `.claude/skills`, `.pi/skills`, or
`.agents/skills` instead.
