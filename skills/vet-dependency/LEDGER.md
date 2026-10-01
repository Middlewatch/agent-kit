# vet-dependency ledger

## 2026-09-29: align discovery and adoption gates
- Motivation: the instruction audit found that discovery excluded existing
  dependencies even when the procedure required re-vetting, and that adverse
  indicators introduced an approval gate absent from the global guide.
- Change: advertise risk-relevant re-vetting, exclude unchanged dependencies
  and routine bumps, and use the global owner gates for adoption decisions.
