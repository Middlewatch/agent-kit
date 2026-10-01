# build — ledger

Revision record per AUTHORING.md's ledger section.

## 2026-09-03 — prove a new gate can fail
- Motivation: the rule "break the thing once and watch the gate go red" lived
  only in the retired `freezable-workflow.md` charter and one project's
  AGENTS.md; the owner's standing complaint is green gates over broken
  features.
- Change: step 4 (Gate once) now says a slice that adds a gate invariant
  breaks it once and watches it go red before trusting green.
- Outcome (2026-09-04 sweep): followed in both build-driven sessions since
  (09-04 introspect-scan and autojournal Files-section builds: new fixture
  gates broken once before trusting green). One day of evidence.

## 2026-09-29: align build stops and check retention
- Motivation: the instruction audit found failed gate runs ending work despite
  the global continuation rule, remote reads caught by a broad stop, and test
  artifacts retained without regard to repository policy.
- Change: use the global owner gates and reassessment rule, follow data-model
  maintenance without an automatic stop, and separate regression checks from
  the decision to retain them.
