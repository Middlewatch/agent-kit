# Extensions repository

One top-level directory per pi extension. The kit's `package.json` names each
entry point and pi loads them from the kit package; adding an extension means
adding its entry there.

- `pi-interlock` (the pre-execution seatbelt: it denies direct credential
  access and machine-level catastrophes, asks before boundary-crossing
  deletes and consequential pushes, and keeps an audit trail) is
  security-sensitive. Changes there get tests proving both the allow and the
  hold paths, and a review pass.
- Tool choices per verification capability: `~/.agents/verification-toolbox.md`
  (machine-local, untracked, seeded from `guidance/verification-toolbox.md.example`).
