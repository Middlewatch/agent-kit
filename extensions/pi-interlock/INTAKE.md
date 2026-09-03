# Intake

One entry per real-use annoyance. Every entry carries all four parts:

- **Complaint**: in the owner's own terms, as experienced.
- **Chesterton check**: why the current behavior exists; what breaks if it
  simply changes.
- **Spec implication**: what the complaint implies for DESIGN.md or the
  conformance harness.
- **Resolution**: what was decided and where it landed (or why it was
  declined).

---

## 2026-08-15: no in-session security-level control

- **Complaint:** "There is no Pi slash command for me to change the security
  level."
- **Chesterton check:** Startup-only configuration kept the enforcement
  snapshot simple, but it forced the owner to edit a file or process environment
  and reload Pi. No security invariant required that friction because slash
  commands are direct user actions, not model-callable tools.
- **Spec implication:** Pi must expose the current mode and allow the owner to
  select `off`, `audit`, or `shield` without restarting. The selection persists
  by default, while save failure must leave live enforcement unchanged.
- **Resolution:** Implemented `/interlock` and
  `/interlock off|audit|shield`, atomic global configuration persistence, live
  shared-mode mutation, footer visibility, argument completion, and real-Pi
  tests. Exact behavior is in
  [`contracts/seatbelt-v2/config.md`](contracts/seatbelt-v2/config.md).
