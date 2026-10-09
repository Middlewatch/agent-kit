# Skills repository

Each top-level directory is one agent skill at `~/agent-kit/skills/<name>`:
pi loads it through the kit package, Claude Code and Codex through the tracked
`claude/skills` and `codex/skills` links.

- After editing a `SKILL.md`, smoke-test that the harness still lists the
  skill: Pi silently drops a skill whose frontmatter `description` contains
  an unquoted `": "`, so keep descriptions quoted.
