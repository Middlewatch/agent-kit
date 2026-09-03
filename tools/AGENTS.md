# Diagnostic CLI toolbox

One directory per owned diagnostic CLI; `README.md` is the index (`sess`,
`prefixdiff`, `portaudit`, `lemonade-hub-sync`, `introspect-scan`). Each
installed binary lives on PATH with `-h` for full usage. `slopcheck` lives in
the `slopfix` skill, which owns it; its PATH link still comes from
`deployments.json`.

- Tools are developed here, in the kit. The kit's `deployments.json` carries
  each tool's binary path and build command, and `bin/install` builds and
  links them; adding a tool means adding its row there.
- After changing a tool, confirm it runs by name. Deployment is the
  `~/.local/bin/<name>` symlink `bin/install` makes; `bin/check` verifies it.
- **Zig tools** (`sess`, `prefixdiff`): rebuild the installed
  binary after every change. `zig build test` alone never reinstalls
  `zig-out/bin/*`, so a green suite says nothing about the binary on PATH.
  Write to stdout with `Io.File.stdout().writerStreaming(io, &buf)`; the
  positional `writer()` pwrites from offset 0 and silently overwrites whatever
  a previous writer already put in the file. It bit all four original tools at
  once, and plain `prog > out` hides it because the shell truncates first.
  Sources follow the Zig pack under the `reference` binding
  (`~/.agents/reference/coding-languages/zig/`) when that binding exists, so
  read its `CONVENTIONS.md` before writing.
- **Script tools** (`portaudit` bash/awk; `lemonade-hub-sync` and
  `introspect-scan` python): no build step, so the symlink points at the
  source and an edit is live immediately.
  Run the tool's own test script before committing. In `portaudit`, mind that
  the awk program is single-quoted. An apostrophe anywhere inside it, even in
  a comment, terminates the quote and produces a baffling parse error.

## Workflow charters

House process detail lives in the cross-project charters:
`~/.agents/kit/guidance/workflows/freezable-workflow.md` (freezability
invariant, asset types, build/review loop, budget tiers) and its
machine-local companion `~/.agents/verification-toolbox.md` (optional, seeded
from `guidance/verification-toolbox.md.example`; tool choices per
verification capability, untracked). Read them before planning builds,
gates, or reviews.
