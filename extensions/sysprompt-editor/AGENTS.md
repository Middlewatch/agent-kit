# sysprompt-editor

Pi extension that rebuilds the core system prompt from the owner-authored
templates in the kit's `guidance/sysprompt/` and manages them through
`/sysprompt` (switch, new, inspect, test). `DESIGN.md` and `README.md` are
the living docs and describe the product as built.

## Project gates and rules

- `scripts/verify.sh` is the definition of green: install, format check,
  typecheck, and unit tests. Run it before any commit that touches this
  directory.
- Fail open is doctrine. Any change to the splice keeps the property that an
  unrecognized condition returns the prompt exactly as Pi built it, and the
  unit suite proves each fail-open branch.
- The extension loads through the kit's pi package, so edits here are live
  in new sessions. Run the gate before stepping away from an edit.
- Templates are guidance prose that becomes the system prompt verbatim; they
  live under `guidance/`, outside this directory's formatter, and the
  gitignored `.active` pointer beside them is machine-local.
- Artifact formats are golden-pinned under `fixtures/golden/` as
  input/expected pairs. A deliberate format change regenerates the expected
  bytes from the pinned input, and the diff is reviewed line by line.
  `fixtures/` is excluded from prettier so those bytes stay stable.
- Generated artifacts go to this directory's gitignored `artifacts/`.
