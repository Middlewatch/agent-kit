# Skills repository

Each top-level directory is one agent skill, consumed by Claude Code, Codex, and
Pi through `~/.agents/skills`, which the kit's `bin/install` links here.

- After editing a `SKILL.md`, smoke-test that the harness still lists the
  skill: Pi silently drops a skill whose frontmatter `description` contains
  an unquoted `": "`, so keep descriptions quoted.
