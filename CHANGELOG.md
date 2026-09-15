# Changelog

All notable changes to this kit. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver.

## [Unreleased]

### Added

- `extensions/sysprompt-editor`: a `{{LOCAL_TOOLS}}` slot renders the
  `## Advertised` section of the machine's `~/.agents/system-tools-index.md`
  into the prompt, minus names not on PATH; the shipped templates place it
  after `<available_tools>`, and `bin/check` warns when an advertised name
  is off PATH. Session logs showed tools named only in the index went
  unused (`portaudit`, `prefixdiff` 0 calls) while the one a skill names
  inline (`slopcheck`) was used in 50 sessions.
- `guidance/sysprompt/astra.md`: a template for GPT-6 Astra whose role block
  carries OpenAI's autonomy, skill-precedence, and name-the-pausing-skill
  guidance. Select it with `/sysprompt switch astra.md`.

### Changed

- `extensions/pi-tui`: the progress widget derives from task-list lines in
  assistant replies (`- [ ]`, `- [x]`, `- [-] … (skip: reason)`) instead of
  a todo tool; `guidance/AGENTS.md` and the evoker-mode playbook standard
  name that convention. Gutter overrides cover only pi's four default tools,
  so `grep`, `find`, and `ls` stay inactive as in stock pi.
- `guidance/AGENTS.md`: the owner-gates list is exhaustive and a question-form
  request is a request; the prose standard applies to documents rather than
  every reply; the "most important information last" rule names the intent
  line it does not conflict with.
- `skills/evoker-mode`: read only the principle files whose rule you will
  cite; `how.md` applies to untraced subsystems rather than every nontrivial
  change; the interrogate playbook leaves `requireMatchedCitations` off.
- `prompts/how.md`: fan-out is sized by the corpus, with no fixed child count.
- `extensions/agent-delegate`: `requireMatchedCitations` lists unmatched
  citations at the top of the returned text instead of failing the call, and a
  failed delegation's error carries its delegation id so it can be assessed.

- `extensions/agent-delegate`: compact result `reads` targets are joined to
  the child's first scope root, so a journal or other consumer sees the
  file rather than the child's scope-relative name.
- `tools/introspect-scan`: a bash glob target in an episode's Files section
  (`skills/*/SKILL.md`) counts for no skill; the README's bias section says
  why.

### Removed

- `extensions/todo`: session logs showed it write-only (85% `status` calls,
  `list` called once); the pi-tui progress widget replaces it.
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
