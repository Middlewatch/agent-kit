---
name: project-scaffold
description: "Stand up the day-one skeleton for a new project."
disable-model-invocation: true
---

# Project scaffold

This skill implements the shape defined in `references/project-layout.md`

In addition read `~/.agents/verification-toolbox.md` (machine-local, seeded from the
kit's `guidance/verification-toolbox.md.example`) before starting, when it exists. The
toolbox names potential tools for each capability below.

There are two stop conditions before any work. If the project directory or repo already
exists, stop and ask whether to scaffold fresh or adopt in place. If the charter files are
missing, stop and look for them, they include necessary intstructions for this process. If
missing flag back to the owner that you cannot proceed.

## Questions to settle

- Project slug and one-sentence purpose.
- Language, chosen per project on the five gateable qualities (loads fast, minimal memory,
  fast compile, sane data structures, comprehensible). When the five qualities don't
  settle it, the choice is the owner's.
- Binary or library. If an active language pack exists under
  `~/.agents/reference/coding-languages/` read its `CONVENTIONS.md` before writing.
- Remote now or later. Default posture is private with no remote until the owner
  determines otherwise.

## Steps

1. **Shape**: `~/.agents/projects/<slug>/` is the git repo, laid out per
   `references/project-layout.md`.
2. **Repo**: `git init` in `<slug>/`, then a `.gitignore` with sane defaults grouped by
   comment: the surround (`.local/`), build output (`zig-out/`, `.zig-cache/`, `dist/`,
   `/build/`, the binary name), caches (`__pycache__/`, `*.pyc`, `.venv/`,
   `node_modules/`), scratch and throwaway (`scratch/`, `*.tmp`, `*.log`, `HANDOFF.md`),
   secrets (`.env`, `*.key`, `*.pem`, `*.secret`), and editor droppings (`*~`, `*.swp`,
   `.DS_Store`).
3. **Gate script**: `scripts/verify.sh` (or `make check`) that is the definition of green.
   It runs all applicable checks among build, format check, lint, tests, and fuzz smoke,
   and skips check types the language lacks rather than stubbing empty ceremony. It is
   runnable locally and in CI from the first commit. Where the gate battery is genuinely
   per-package, the script may be a thin dispatcher over named sub-gates, but one command
   must still reproduce CI locally.
4. **CI**: a workflow that only runs the gate script on every push, so local and CI can
   never disagree. Add it when the remote exists. Until then, name it in the deferred line
   of the report and in AGENTS.md.
5. **Pins**: pin the toolchain so the gate can enforce it rather than just record it,
   either through a `scripts/<lang>.sh` wrapper that asserts the exact version and execs
   it (a `scripts/zig.sh` that compares `zig version` to the pinned string and `exec`s the real binary) or through `go-version-file:
   go.mod` in CI. Checksum-pin vendored deps.
6. **Test shape**: `tests/`, an external conformance harness driving the real binary
   through its real interface, and `fixtures/`, even if near-empty. The house pattern is
   stdlib-only Python: `unittest` for assertion suites and bare `def main()` drivers
   taking the binary path as argv[1], so the harness has nothing to install. Commit fuzz
   seeds where the language has a native fuzzer, at the layout that fuzzer expects
   (`testdata/fuzz/` in Go). Add `contracts/` for frozen language-neutral interface
   descriptions (wire protocols, file formats, extension seams) once the project has an
   external surface.
8. **Docs**: `docs/specs` (owned by `spec` skill), `docs/adr` (generated lazily), other
   documentation as it is created lives here.
9. **AGENTS.md**: brief summary of what an agent will need to navigate the project that is
   not already enumerated in global AGENTS.md and the system prompt template.

## Verify

- One baseline commit containing the whole skeleton, named for what it
  establishes ("scaffold <slug>: repo, gate, harness shape, charters").
  The gate is green at that commit.
- Prove the gate can fail: break one check, watch it go red, revert.
- Report back in product terms: what exists, what was deferred, and which
  decisions (remote, budgets, first invariants) still belong to the owner.
