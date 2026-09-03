# Project layout

This document defines the directory shape of a project under

## Shape

`~/.agents/projects/<slug>/` is the git repo. There is no wrapper
directory: the folder root and the repo root are the same place.

```
<slug>/
├── src/                  # or the language's own source layout
├── tests/                # external conformance harness
├── fixtures/
├── scripts/verify.sh     # the gate; the definition of green
├── docs/
│   ├── specs/            # owned by the spec skill
│   └── adr/              # created lazily by the first ADR
├── .local/               # gitignored working surround (see below)
├── .gitignore
├── AGENTS.md
├── README.md
└── package.json / go.mod / build.zig / pyproject.toml / ...
```

The scaffold creates only this root. The inside of `src/` belongs to the language: follow
the standard language conventions as you know them or the language pack's `CONVENTIONS.md`
under `~/.agents/reference/coding-languages/` when one exists, and let the tree grow as
the project develops.

## The working surround: `.local/`

Everything project-specific that stays out of the published repo lives in
one ignored directory, so it travels with the project as a unit:

```
.local/
├── artifacts/            # evidence: gate logs, review reports, measurements
├── documentation/        # dated reviews, rulings, handoffs
├── notes/
└── spikes/
```

`.gitignore` carries the single line `.local/`. Charter and skill
references to the project's artifacts directory mean `.local/artifacts/`.
Because `.local/` is ignored rather than outside the repo, `git clean -x`
removes it; the plain `-fd` form leaves it alone.

`docs/` is tracked, current-state, part of the product. `.local/documentation/`
is the unversioned dated record. Keep them distinct.

## Oracles

Pinned prior implementations kept as behavioral oracles live out-of-tree
at `~/.agents/reference/oracles/<name>/`, shared across projects. A
project that uses one points at it with a symlink or a one-line note in
`.local/` (the note travels across machines; the symlink is
machine-local).
