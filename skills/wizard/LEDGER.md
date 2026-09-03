# wizard — ledger

Revision record per AUTHORING.md's ledger section. Entries before 2026-09-01
are backfilled from git.

## 2026-08-22 — headless-session URL handling
- Motivation: on headless sessions the generated wizard's URL was not
  reachable from the transcript, and values settled in earlier stages were
  lost from view (0e78ff0).
- Change: the wizard prints its URL on headless sessions and re-prints
  cross-stage values.
