# evoker-mode — ledger

Revision record per AUTHORING.md's ledger section. Entries before 2026-09-01
are backfilled from git.

## 2026-08-24 — tail reminder via neoskills re-send
- Motivation: the neoskills schema-v2 experiment added per-session persistence
  (`persist: session`), and the router was to lean on its re-sent tail
  reminder (14a6790).
- Change: added the re-sent reminder to the skill tail.
- Outcome: reverted the next day (4d831f8) with the full neoskills schema-v2
  rollback; the rollback's own motivation was not captured at the time.
  Recorded here so the next persistence experiment starts from this attempt.

## 2026-09-03 — delegation doctrine pointer moved to the extension README
- Motivation: `guidance/workflows/delegation-standard.md` retired; its root-side
  judgment now lives in `extensions/agent-delegate/README.md` ("When
  delegation repays").
- Change: the Delegation section cites the README instead of the charter.
- Outcome (2026-09-04 sweep): the pointer resolves; three sessions since read
  the README (09-03 sweep, 09-04 build and delegate-fix sessions), all of them
  editing the extension, so no evidence yet that the citation drove a read.

## 2026-09-04 — authoring-a-skill playbook retired in favour of skill-author
- Motivation: 2026-09-04 sweep P1. The playbook was read in 0 of 66
  evoker-mode episodes with exact capture while the `skill-author` skill
  (10 invocations, 7 read-backed) covers the same task; `playbooks/TEMPLATE.md`
  was linked only from the playbook.
- Change: playbook deleted; the router row says run `skill-author` and, for a
  playbook, follow `guidance/playbook-standard.md` (which links TEMPLATE.md).
