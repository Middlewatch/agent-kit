# Changelog

All notable changes to this kit. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver.

## [Unreleased]

### Removed

- `tools/lemonade-hub-sync`: tied to one inference server's internals and
  one disk layout, so it moved to the owner's private tools repo.

## [0.1.0] - 2026-09-02

First public release, published as `@middlewatch/pi-agent-kit`.

### Added

- The `~/.agents` convention: named bindings (`kit`, `wiki`, `inbox`,
  `journals`, `reference`, `projects`) and `bin/install`, which links the
  guide and skills into Pi, Claude Code, and Codex, builds and links the
  tools, and registers the kit as a Pi package. `bin/check` verifies the
  installed state; `--lint` and `--scan` guard the tracked tree.
- Guidance: the global guide and Claude adapter, `LOCATIONS.md`, seed
  templates for machine facts, the workflow charters (delegation standard,
  freezable workflow), workspace overlays, and the system prompt templates.
- Thirty skills, including `evoker-mode` (workflow router with playbooks and
  principles), `spec` and `build`, `as-built`, `public-release`, `slopfix`
  (with the `slopcheck` linter), `deep-research`, `deep-review`, `diagnose`,
  `adr`, `harvest`, `introspect`, and `skill-author`.
- Nine Pi extensions: `pi-interlock` (pre-execution seatbelt with audit
  trail), `agent-delegate` (depth-one delegation), `pi-scratchpad`,
  `pageview`, `todo`, `pi-tui` (owner TUI layer and the modus-vivendi-tinted
  theme), `prompt-picker`, `pi-config`, and `sysprompt-editor`.
- Prompt templates for `/prompt`: `bro`, `catchup`, `how`, `review-staged`.
- Tools: `sess`, `prefixdiff`, `portaudit`, `lemonade-hub-sync`,
  `introspect-scan`, and the `trail` decision logger.

[Unreleased]: https://github.com/Middlewatch/agent-kit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Middlewatch/agent-kit/releases/tag/v0.1.0
