# build — ledger

Revision record per AUTHORING.md's ledger section.

## 2026-09-03 — prove a new gate can fail
- Motivation: the rule "break the thing once and watch the gate go red" lived
  only in the retired `freezable-workflow.md` charter and one project's
  AGENTS.md; the owner's standing complaint is green gates over broken
  features.
- Change: step 4 (Gate once) now says a slice that adds a gate invariant
  breaks it once and watches it go red before trusting green.
