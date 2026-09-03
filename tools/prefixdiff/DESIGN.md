# prefixdiff: design basis

## Status and reading list

**Ratified 2026-08-06.** This document describes the product as it is.

Read beside this document:

- `README.md`: usage, output format, build and install.
- `src/main.zig`: the implementation. Its layers correspond to **Structure**.
- `harness/`: the external conformance harness, with its own README describing
  the three assets and how they are kept honest.

## Thesis

Given two byte streams that were meant to share a prefix, prefixdiff reports
where that prefix ends and what broke it correctly, with output sized by
the requested context rather than by the inputs.

The acceptance test has two halves, and a build can run each:

1. **Correct.** The reported divergence offset and the process exit code agree
   with `cmp(1)` over generated input pairs spanning every shape class:
   identical, mid-buffer mutation, strict-prefix extension, truncation, and
   empty. `cmp` is the oracle because it is independently authored,
   POSIX-specified, and older than every assumption in this code. Measured
   2026-08-06 over 400 generated pairs: zero disagreements on either.
2. **Bounded.** Output size is capped by `--context` and does not grow with
   input size. Measured 2026-08-06 at a fixed `-c 64`, inputs from 1 KB to
   4 MB (a 4096-fold range) produced 411 to 429 bytes of output. The drift
   is the decimal width of the reported byte counts. Over the same 4 MB
   input, `-c 4` produced 189 bytes and `-c 512` produced 2221. Output tracks
   the flag rather than the file.

The second half is the reason this is not `diff`. Request payloads are
routinely a single line tens or hundreds of kilobytes long. A line-oriented
differ sees one changed line and prints both copies of it, which answers
nothing and costs a screenful or a context window.

## Model and primitives

A **payload** is the serialized request body an inference API receives. The
tool never parses one. Its unit is the byte, and every primitive below is
defined in bytes.

The **divergence offset** is the index of the first differing byte, 0-based.
When the offset is absent, the inputs are identical. This is the whole compute
core. Everything else is location and presentation.

A **strict prefix** is the case where one input runs out while still matching.
One input is a complete prefix of the other. It is reported as its own outcome
rather than as an offset because it is the *healthy* shape for a growing
conversation, where the cached prefix survived intact and the request merely got
longer. A divergence in the middle of shared content is the pathological shape.
Collapsing the two into one message would hide the distinction that matters
most to the reader.

The **context window** is the escaped rendering of up to `--context` bytes on
each side of the offset, with `┃` marking the exact byte and `⟨EOF⟩` marking a
side that ended there. It exists because the offset alone does not tell you
what changed, and extracting those bytes by hand is the work the tool removes.

The **common-prefix percentage** is the offset as a fraction of each input. It
is the severity reading: a divergence at 2.8% means nearly the entire request
went cold, and one at 99% means almost all of it was still served warm.

## Doctrine

Invariants, with the date each was established. These carry into any rewrite as
requirements.

- **D1: The unit is the byte; input is never interpreted (2026-08-06).** No
  JSON parsing, no tokenization, no notion of a cache breakpoint or a
  provider's minimum cacheable length. Bytes are bytes under every provider and
  every API revision, so the tool cannot go stale. A version that understood
  cache-control semantics would silently stop being correct the next time a
  vendor changed them, and no test can catch a rule that is merely out of date.
- **D2: `cmp(1)` compatibility is a contract (2026-08-06).** Exit codes are 0
  identical, 1 differ, 2 error, matching `cmp`, so the tool drops into scripts
  and pipelines already written against it. Offsets are reported 0-based where
  `cmp` reports 1-based, and that difference is documented rather than
  papered over. The offset here is meant to be usable directly as a slice
  index, and matching `cmp`'s display convention would put every such use off
  by one. The contract binds every exit path, including failures that occur
  after the comparison succeeds. A report that cannot be written is an error
  and exits 2, never 1. Exiting 1 there would report "the payloads differ" on
  inputs the tool had just found identical, which is a false answer to the only
  question it is asked.
- **D3: Nothing this program displays can drive the terminal (2026-08-06).**
  Every byte reaching a stream leaves as printable ASCII. C0 controls, DEL, and
  everything at or above 0x80 become a backslash escape: `\n`, `\t`, `\r`,
  `\\`, or `\xNN`. Only the 0x20–0x7E range passes through unaltered. This
  covers file content *and* the echoed file names and arguments, on standard
  output and in error messages alike, through a single escaping table. A path
  is a byte string somebody else may have chosen, and one arriving from a glob
  over a directory the operator does not own is an ordinary way to use a
  comparison tool. Payloads carry arbitrary model
  output, tool results, and shell transcripts. An unescaped title-set sequence
  inside a system prompt would otherwise execute on display. Verified
  2026-08-06 against content holding OSC, CSI, NUL, and DEL sequences: no
  escape byte reached the terminal.
- **D4: Output is bounded by the requested context, never by input size
  (2026-08-06).** The window is capped at `--context` bytes per side and
  escaping expands each byte by at most four characters, so the report has a
  ceiling the caller sets and the inputs cannot raise. This is the invariant
  that makes the tool safe to run against an arbitrarily large payload and
  safe to run inside a context window. The one term outside the cap is the
  echoed input paths, which are as long as the caller made them.
- **D5: Both inputs are read whole, and the domain is payloads
  (2026-08-06).** Reads are into memory rather than streamed, capped at 2 GiB
  per input. Rendering the left half of the context window requires random
  access behind the offset, and the working domain is request payloads measured
  in kilobytes to megabytes. Comparing disk images is not the job, and a
  streaming rewrite would buy nothing this domain needs.
- **D6: The exit code answers only "identical or not" (2026-08-06).** A strict
  prefix and a mid-content divergence are different outcomes and both exit 1.
  The distinction reaches a machine caller through the report, never by
  widening the code space, because D2's entire value is using the same three
  codes `cmp` uses. A flag that changes exit codes is a trap for whoever
  sets it once in a wrapper script and forgets. A caller that needs the outcome
  class reads it rather than branching on the status.

## Expected behaviors

One command, two positional paths, two options:

```
prefixdiff [options] <fileA> <fileB>

  -c, --context <n>   bytes of context each side of the divergence (default 64)
  -q, --quiet         no output; exit code only
  -p, --porcelain     one machine-readable summary line instead of the report
  -h, --help          show this help
  --                  end of options; treat the rest as file names
```

The report names both inputs with their sizes, then either `identical` or the
divergence: common-prefix length with its percentage of each input, the offset
with `line`/`col`, and the two context windows aligned on the `┃` marker. Where
one input is a strict prefix of the other, the offset line is replaced by a
statement of which side is the prefix and how many bytes the longer side
continues for.

`line` and `col` are 1-based and computed from A, which is sound because
everything before the offset is identical by definition. They are reported only
for a mid-content divergence; a position past the end of a file has no
meaningful column.

Inputs are ordinary paths and may be pipes as well as regular files:
`/dev/stdin`, named FIFOs, and shell process substitution all read correctly,
verified 2026-08-06. A path beginning with `-` is reachable after `--`.

`--porcelain` replaces the report with one line of `key=value` fields in a
fixed order. This is the surface a script reads because the exit code answers
only "identical or not" (D6):

```
status=differ prefix=6 a_bytes=11 b_bytes=11 a_pct=54.5 b_pct=54.5 line=1 col=7
```

`status` is `identical`, `prefix`, or `differ`, from the same classification
the report uses, so the two cannot disagree about what happened. `line` and
`col` appear only for `differ`, matching the report's rule. File names are
omitted deliberately because the caller passed them, and echoing them would make
the line's length depend on its input. `--porcelain` and `--quiet` are different
output modes and specifying both is an error.

An empty input reports 100% of itself as shared. That is the literally correct
answer (all of nothing is common), and it is never read alone because an
empty input against a non-empty one is always classified `prefix` and says so.

## Deliberately not in scope

- **Cache-block and token awareness.** Knowing whether a divergence sits before
  or after a `cache_control` breakpoint, or how many tokens went cold, would be
  more directly useful and would couple the tool permanently to one vendor's
  API shape. D1 is the trade: this tool reports the byte truth, which stays
  correct, and the operator supplies the provider knowledge, which does not.
- **Reading payloads out of session transcripts.** A flag to pull two
  consecutive requests straight from a session file would save a step and would
  give this tool the transcript-format coupling it currently has none of. That
  coupling is the expensive kind (undocumented formats that change without
  notice), and it belongs to the tool that already carries it.
- **A `-` convention for standard input.** It is redundant rather than rejected.
  `/dev/stdin` delivers a stream to either positional argument anywhere it
  exists, and process substitution does the same on bash, zsh, and ksh, at zero
  cost in code or tests.
- **Comparing more than two inputs.** The question the tool answers is about a
  prefix shared by a pair. An N-way version answers a different, vaguer
  question and has no `cmp` oracle behind it.
- **Line-oriented diffing, or emitting a patch.** That is `diff`'s job and
  `diff` is better at it. The inputs here are commonly a single enormous line,
  which is precisely where line-oriented tools stop being useful.
- **Writing or modifying anything.** The tool is strictly read-only. It is
  handed evidence, and a diagnostic that can alter its own evidence is not one.

## Verification spine

**Oracle.** `cmp(1)` covers the entire compute core (the divergence offset and
the exit-code contract) and is the best kind of oracle available: independent
author, independent implementation, a specification older than the problem
domain, and present on every POSIX system. A differential run over generated
pairs across all five shape classes is therefore cheap and near-total for D2
and the correctness half of the thesis.

A second derivation covers the outcome class, the percentages, and line and
column, which `cmp` has no opinion about. It recomputes them from the raw bytes
in a different language, written from this document rather than from the
implementation.

Rendering has no external oracle. The escaping table, the ellipsis and `⟨EOF⟩`
markers, the percentage formatting, the plurals, and the strict-prefix wording
are choices this tool makes alone, so they are pinned by recorded golden output
rather than by a second derivation. Goldens detect change; they do not
establish correctness.

**Hostile input.** Escaping is the security-relevant property (D3) and is
asserted rather than argued from the escaping table. Every harness case checks
the raw bytes of both output streams for control bytes across all three
channels an attacker can reach: file content, file names, and arguments.

A harness that cannot fail is worth nothing, so it is checked against
deliberately broken builds rather than trusted. An off-by-one offset, an
escaping table that lets `0x1b` through, and a window that ignores `--context`
must each be caught by the asset responsible for it. Re-run that check after
changing the harness. If a mutant still passes, the harness is what broke.

Boundedness is asserted the way it is stated: by sweeping input size across
several orders of magnitude at a fixed context and requiring the output to stay
flat, and by sweeping context at a fixed input and requiring it to move.

**Freezability.** *If this tree vanished, what would rebuild the behavior?*
This document plus a committed external harness (the `cmp` differential, the
boundedness sweeps, and recorded golden output for the rendering) would let a
rewrite in another language be checked without reading a line of the original.
The compute core is fully covered by the differential, the thesis by the
sweeps, and the rendering byte-for-byte by the goldens. In-language tests are
necessary but not sufficient. An assertion that lives only inside
`src/main.zig` dies with `src/main.zig`, which is exactly the case a rebuild
has to survive. Ten in-language tests remain as the fast inner loop, but
nothing about the product's observable behavior depends on them alone.

Goldens carry a cost worth stating plainly. They pin the human-readable report
byte-for-byte, so every later wording change becomes a golden-breaking change.
This happened. Correcting the report's plurals broke the `cmp`
differential, which was parsing the word `bytes`. Therefore, the check failed on
a rendering change that altered no behavior it was meant to test. A harness that
parses prose inherits the prose's churn, which is why the differential reads
`--porcelain` and the goldens alone carry the report.

## Structure

Layers in dependency order. They currently live as one module, which is
proportionate at roughly 300 lines.

1. **Argument parsing:** flags, `--`, and the two positional paths, to a
   settled configuration or a usage failure.
2. **Input acquisition:** both inputs read whole, under the D5 cap.
3. **Compute:** the divergence offset. One call, and the only part with an
   external oracle.
4. **Location:** line and column from the offset, and the percentages.
5. **Rendering:** one escaping table serving both content and displayed
   arguments (D3), one outcome classification serving both renderers, and the
   two of them: the human report and the `--porcelain` summary line.
6. **Verification:** in-language tests for the fast inner loop, and the
   external harness in `harness/` for everything the product promises.

The module stays whole until a second consumer of the compute layer exists.
Splitting a file this size before then buys navigation nobody needs and costs a
build-graph edge.

## Provenance

- **`cmp` differential, 2026-08-06.** 400 generated input pairs across
  identical, mutated, extended, truncated, and empty shapes, comparing
  divergence offset and exit code against `cmp(1)`. Zero disagreements on
  either. This established `cmp` as a working oracle and converted the
  correctness half of the thesis from a claim into a measurement.
- **Terminal-safety probe, 2026-08-06.** Inputs carrying OSC title-set, CSI
  colour, NUL, and DEL sequences confirmed D3 for file content. The same probe
  applied to *file names* found the sequences reaching the terminal unmodified,
  on standard output and in error messages; closing that is what made D3 an
  invariant covering everything displayed rather than one covering content with
  a caveat attached.
- **Boundedness sweeps, 2026-08-06.** A 4096-fold input-size sweep at fixed
  context moved output by 18 bytes; a context sweep at fixed input moved it
  from 189 to 2221. Together these establish which term the report actually
  tracks.
- **Exit-contract audit, 2026-08-06.** An independent review found two paths
  that left the `cmp` code space: an unchecked addition in the context window
  aborted the process on an extreme `--context`, and a failed write exited 1
  rather than 2. The failed write reported "differ" on inputs already found
  identical. Both were closed, and D2 states the corrected behavior rather than
  being written around the defects.
- **Mutation check of the harness, 2026-08-06.** Three deliberately broken
  builds (an off-by-one divergence offset, an escaping table passing `0x1b`,
  and a window ignoring `--context`) were each caught by the asset responsible
  and passed by the others. This established that the harness detects the
  failures it claims to and that its three assets are independent rather than
  overlapping.
- **Origin.** The tool predates its version control; the source was imported
  unchanged on 2026-08-05 from the prompt-cache debugging work it was written
  for.
