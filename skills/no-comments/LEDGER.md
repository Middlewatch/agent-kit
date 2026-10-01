# no-comments ledger

## 2026-09-29: protect required structured records
- Motivation: the instruction audit found that the comment keep rules could
  delete internal ownership and lifetime records required by data-model.
- Change: recognize required structured records as a keep-list exception and
  require scoped proof of the applicable exception when judging a keep.
