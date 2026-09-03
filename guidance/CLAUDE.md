@~/.agents/AGENTS.md

# Claude Code additions

- The import above resolves once `bin/install` has linked `~/.agents/AGENTS.md`.
  The guide is shared across harnesses; its references to pi extensions and
  `~/.pi` paths describe Pi deployments only. Use Claude Code's native
  configuration mechanisms for Claude-specific resources.
- Where a workspace contains `CLAUDE.md -> AGENTS.md`, treat that file as the
  workspace's shared cross-harness policy rather than a second policy layer.
