# deep-research: source repo

Research that persists. One skill, two modes, one contract: every run ends with a
citation-linted report filed into `~/.agents/wiki`, its sources appended to the lane's
link-map (`~/.agents/wiki/<lane>/link-maps/<domain>.md`, the grep-able sources ledger for
future agents).

- **research mode (default)**: orchestrator-led. The primary agent scopes, searches, reads,
  and compacts in its own context. Subagents cover extra domains when the topic spans several,
  and independent refuters check load-bearing claims before the report ships.
- **deep mode (on request / wide questions)**: real fan-out. Decompose into sub-questions
  (with source-type coverage across papers, vendor docs, and practitioner/critic reports),
  assign one fresh-context researcher child per sub-question and independent refuters per
  load-bearing claim, and let the orchestrator synthesize.

## Layout

- `SKILL.md`: both modes on the agent-delegate extension (`delegate` tool, named
  `researcher`/`refuter` agents, per-child `resultSchema`), source
  `~/.agents/kit/extensions/agent-delegate`.
- `references/report-spec.md`: the shared contract: report format, source standards,
  citation lint, wiki filing (existing-note check first), sources ledger.
- `references/findings.schema.json`, `references/verdict.schema.json`: child output schemas.
- `bin/citation-lint.py`: code gate: every inline `[n]` resolves to a real, URL-bearing
  source entry.

The extension owns the child model route; the orchestrator does not route models per child.

## Install

The skill reaches every client through the `~/.agents/skills` link that `bin/install`
makes.

## Breadth vs token spend vs quality

The standing result from graded runs (2026-07): architecture beats effort only when the
decomposition covers source types.
