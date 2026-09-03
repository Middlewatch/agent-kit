# External conformance harness

```
./harness/run.sh                        check everything
./harness/run.sh --record               rewrite the rendering goldens
PREFIXDIFF=/path/to/build ./harness/run.sh
```

Needs `python3`, `cmp(1)`, and a built binary. Exits 0 on pass.

This directory exists for freezability. It plus `DESIGN.md` should be enough
to check a rewrite in another language without reading the original. Nothing
here may import from `src/` or assume Zig. Everything drives the real binary
through its real command line.

## The three assets

**`differential.py`:** checks the compute core against two independent references.
`cmp(1)` supplies the exit code and the first differing byte. It is
independently authored, POSIX-specified, and older than anything in this repo.
A re-derivation in Python, computed from the raw bytes, covers what `cmp` has
no opinion about: the outcome class, the percentages, and line/column. Each run
uses 500 seeded pairs that span these input shapes: identical, mutated, extended,
truncated, and empty. The run asserts that every shape class actually occurred.

**`boundedness.py`:** tests the second half of the thesis. Input size sweeps four
orders of magnitude at a fixed context and the output must stay flat. Context
sweeps two orders at a fixed input and the output must move. Both use short
relative paths because the report echoes the names it is given and a sweep run
with long absolute paths measures the path.

**`goldens.py`:** checks the rendering, which `cmp` cannot check. It pins the
following byte-for-byte across 24 cases: the escaping table, the markers, the
plurals, the summary line's field order, and every error message. These detect
change, but they do not establish correctness. A golden is only ever as right as the day it
was recorded. Every case additionally asserts D3 on the raw bytes of both
streams: no control byte may reach a terminal, whether it came from file
content, a file name, or an argument.

## Reading it against the tool

The harness reads `--porcelain`, never the human-readable report. A check that
parses prose inherits the prose's churn. An earlier version matched the literal
word `bytes` and broke when a plural was corrected. The check failed on a change
that altered nothing it existed to test.

## Keeping it honest

A harness that cannot fail is worth nothing, so it is checked against
deliberately broken builds rather than trusted. Three mutants, each caught by
the stage that should catch it and passed by the others:

| mutation | caught by |
|---|---|
| off-by-one in the divergence offset | `differential`, where offset, status, percentage, and line/column all disagreed |
| escaping lets `0x1b` through | `goldens` (D3 violations on stdout, on the echoed file name, and on stderr) |
| window ignores `--context` and prints the whole input | `boundedness`, with both sweeps and two goldens |

Re-run that check after changing the harness. Point `PREFIXDIFF` at a patched
build. If the harness still passes, the harness is the thing that is broken.

## Changing the goldens

`--record` rewrites them and prints nothing about whether the new output is
correct. Read the diff. A golden change is a deliberate change to the
product's observable surface, and is the one place where a rendering tweak
stops being free.
