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
