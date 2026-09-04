# project-scaffold — ledger

Revision record per AUTHORING.md's ledger section.

## 2026-09-03 — freezability invariant moved into the layout reference
- Motivation: `guidance/workflows/freezable-workflow.md` retired; its claim
  (external artifacts are the durable asset, code is a projection) was the
  one part importers restated in their own words, and the scaffold is where
  new projects take their shape.
- Change: `references/project-layout.md` states the invariant beside the
  `tests/`, `fixtures/`, and `scripts/verify.sh` entries.
- Outcome (2026-09-04 sweep): `references/project-layout.md` was read by two
  non-sweep sessions since (09-02 teach, 09-03 lemonade extension); whether
  the invariant landed in a new project's layout is unobserved.
