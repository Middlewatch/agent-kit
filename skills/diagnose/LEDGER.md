# diagnose ledger

## 2026-09-29: separate regression proof from test retention
- Motivation: the instruction audit found that mandatory suite retention
  conflicted with the projects workspace's narrower committed-test policy.
- Change: require a regression check, retain it according to the task and
  repository policy, and accept scratch reproductions when permanent tests
  are neither requested nor established.
