# prefixdiff

Reports where two files' bytes first diverge: common-prefix length, percentage
of each file, divergence offset with line:col, and an escaped context window
with a `┃` marker at the exact byte.

Built for prompt-cache debugging. Warm inference lanes require byte-identical
request prefixes. When caching silently degrades, the question is always "at
which byte, and what changed?" This answers it in one command instead of a
manual diff of two 40 KB blobs.

## Usage

```
prefixdiff [options] <fileA> <fileB>

  -c, --context <n>   bytes of context each side of the divergence (default 64)
  -q, --quiet         no output; exit code only
  -p, --porcelain     one machine-readable summary line instead of the report
  --                  end of options; treat the rest as file names
```

Exit codes follow `cmp(1)`: 0 identical, 1 differ, 2 error. They answer only
"identical or not." A strict prefix and a mid-content divergence both exit 1,
and the distinction is in the report.

```
$ prefixdiff a.json b.json
A: a.json (192528 bytes)
B: b.json (192528 bytes)

common prefix: 31337 bytes — 16.3% of A, 16.3% of B
diverges at byte 31337 (line 18, col 9268)

A: …GtQs8zVgVRXzx┃9HxhIzjQJn7sOw0n…
B: …GtQs8zVgVRXzx┃ZHxhIzjQJn7sOw0n…
```

Offsets are 0-based (`cmp` reports the same byte 1-based). Control and
non-ASCII bytes are escaped (`\n`, `\x00`) so the output always fits one
terminal line. `⟨EOF⟩` marks a strict-prefix divergence. Escaping covers file
names as well as file content, so a hostile filename cannot drive your
terminal.

Inputs may be pipes: `/dev/stdin` and process substitution both work, so
there is no `-` convention.

For scripts, `--porcelain` replaces the report with one line of `key=value`
fields in a fixed order:

```
$ prefixdiff --porcelain a.json b.json
status=differ prefix=31337 a_bytes=192528 b_bytes=192528 a_pct=16.3 b_pct=16.3 line=18 col=9268
```

`status` is `identical`, `prefix`, or `differ`. A strict prefix means the
cached prefix survived and the request merely got longer, which the exit code
alone cannot tell you. `line` and `col` appear only for `differ`.

## Build

```
zig build -Doptimize=ReleaseSafe    # pinned toolchain: zig 0.16.0
zig build test
```

Install is a symlink on `PATH` pointing into this repo's `zig-out/bin`, so a
rebuild is what deploys.

## Verification

```
zig build test        # in-language tests, the fast inner loop
./harness/run.sh      # external conformance harness
```

`cmp(1)` is the oracle for the compute core. A differential over 500 seeded
input pairs spans five shapes: identical, mutated, extended, truncated, and
empty. It agrees with `cmp(1)` on the divergence offset and the exit code. A
re-derivation in another language covers the outcome class, the percentages,
and line/column. Two sweeps assert that output size tracks `--context` rather
than input size, and 24 recorded goldens pin the rendering and assert that no
control byte reaches either output stream. See `harness/README.md`.

See `DESIGN.md` for the thesis, the doctrine behind these choices, and what is
deliberately out of scope.

## Repository

This tool lives in the agent kit at `tools/prefixdiff`; commit there.
The kit's `bin/install` builds it and links the binary into `~/.local/bin`.
