# Extensions repository

One top-level directory per pi extension. The kit's `package.json` names each
entry point and pi loads them from the kit package; adding an extension means
adding its entry there.

- `pi-interlock` (the pre-execution seatbelt: it denies direct credential
  access and machine-level catastrophes, asks before boundary-crossing
  deletes and consequential pushes, and keeps an audit trail) is
  security-sensitive. Changes there get tests proving both the allow and the
  hold paths, and a review pass.

## Workflow charters

House process detail lives in the cross-project charters:
`~/.agents/kit/guidance/workflows/freezable-workflow.md` (freezability
invariant, asset types, build/review loop, budget tiers) and its
machine-local companion `~/.agents/verification-toolbox.md` (optional and
untracked, seeded from `guidance/verification-toolbox.md.example`, listing
tool choices per verification capability). Read them before planning builds,
gates, or reviews.
