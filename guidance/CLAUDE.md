@~/.agents/AGENTS.md

# Claude Code additions

- The import above resolves once `bin/install` has linked `~/.agents/AGENTS.md`.
  Only pi reads `RULES.md` and `APPEND_SYSTEM.md`; use Claude Code's native
  configuration for Claude-specific resources.
- Where a workspace contains `CLAUDE.md -> AGENTS.md`, treat that file as the
  workspace's shared cross-harness policy rather than a second policy layer.
