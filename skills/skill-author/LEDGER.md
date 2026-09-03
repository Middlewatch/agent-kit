# skill-author — ledger

Revision record per AUTHORING.md's ledger section. Entries before 2026-09-01
are backfilled from git.

## 2026-08-23 — teach schema v2 as the selection contract
- Motivation: build-review finding — the authoring guidance still taught v1
  (authored descriptions carrying trigger cues) while skills had migrated to
  trigger-plus-not_for frontmatter (b6796e5).
- Change: skill-author and AUTHORING.md taught the v2 selection contract,
  generated descriptions, and the lint check.
- Outcome: reverted 2026-08-25 (cc79ff6) with the neoskills schema-v2
  rollback; the descriptions-as-selection-contract doctrine survived in v1
  form (workflow step 2).

## 2026-09-01 — edit-time ledger step
- Motivation: introspect spec S2
  (`~/.agents/kit/docs/specs/2026-09-01-introspect.md`) — no record tied a
  skill revision to its motivation, so revisions could not learn from prior
  ones.
- Change: hand-off step now appends a motivation → change entry to the revised
  skill's LEDGER.md.
