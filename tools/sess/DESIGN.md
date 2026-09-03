# sess: design basis

## Status and reading list

**Ratified 2026-08-06.** This document describes the product as it is.

Read beside this document:

- `README.md`: usage, column semantics, build and install.
- `src/main.zig`: the implementation. Its section banners correspond to the
  layers in **Structure**, though not in that order.
- `src/testdata/`: the committed fixture corpora that pin both formats.
- `harness/`: the external conformance harness and its SQL oracles.

## Thesis

Every question sess answers about an agent session is answered correctly
across every transcript format it supports, in output bounded by the shape of
the question rather than the size of the input.

The acceptance test has two halves, and a build can run each:

1. **Correct.** Three oracles, in increasing order of independence. The
   committed fixture corpora assert exact counts per format. An independent
   re-derivation computes the same aggregates from the raw transcripts with a
   general query engine. It is written from the transcript format rather than
   from this implementation and must agree on every numeric column. This is the
   only one of the three that can catch a shared misunderstanding because it has
   a different author and a different engine. And any change to detection or
   extraction must show no unintended movement in a differential. The baseline
   is the binary built from the preceding commit, the snapshot is one file list
   captured before the run and reused for both binaries, and the comparison is
   column-by-column. The differential detects change rather than correctness.
   It is the third oracle precisely because a bug present in both binaries
   passes it.
2. **Bounded.** Output size scales with the shape of the question (session
   count, distinct tool names, an explicit `-n` or `-m`) and never with input
   size. A command whose output grows with the corpus fails this half. Every
   command currently satisfies it. The check is to run each over a large
   corpus and confirm the output does not grow with it.

The second half is the reason the tool exists. Transcripts are read by agents
and by people working through a context window. A summary that is itself too
large to read has not solved anything.

## Model and primitives

A **transcript** is an append-only JSONL file written by a coding harness, one
JSON object per line. Transcripts are *undocumented and unstable*: their shape
is an implementation detail of the harness that writes them, and it changes
without notice or versioning. Every design decision here follows from that.

A **format** identifies which harness wrote a file. It is detected from the
file's leading lines, never from its path or name, because the same directory
tree also holds JSONL that is not a transcript at all.

A **line** is untrusted at the read boundary. It may be malformed, truncated
mid-write (transcripts are appended live), or carry values outside any sane
range. It may also carry hostile text, since transcript content includes
arbitrary command output and model tokens.

**Facts** is the normalized per-line view and the central seam of the design:
timestamp, model, request id, token usage, and a list of blocks, reduced to one
shape regardless of which harness wrote the line. Everything above this seam
(every count, table, and search result) is written once against Facts rather
than per format. This is the layer that has no substitute outside the tool. The
formats disagree on field names, on block type names, and on whether a tool
result is a message role or a block inside one.

Within Facts:

- **Kind** classifies a line as `prompt`, `assistant`, `tool_result`, or
  `meta`. Harnesses reuse the `user` role as transport, so *prompt* means a
  person wrote it rather than that the line claims the user role.
- **Block** classifies content as `text`, `thinking`, `tool_call`, or
  `tool_result`.
- A **turn** and an **API request** are different things and are counted
  separately. One request may span several transcript lines, and one turn may
  span many requests.

A **renderer** is a command that consumes Facts and writes to standard output.
Renderers own presentation and bounding. They do not own semantics.

## Doctrine

Invariants, with the date each was established. These carry into any rewrite as
requirements.

- **D1: Stored input is untrusted, and so is the file list (2026-08-06).**
  Malformed JSON, missing fields, and out-of-range values are handled at the
  read site and never abort a sweep. A single bad line in one file must not
  cost the results of every other file, and neither must a single bad *file*.
  A sweep is routinely handed a path list captured moments earlier while
  sessions are being written, rotated, and deleted underneath it, so a path
  that has since vanished is a skip with a warning, never a fatal error.
  Exactly one place in the program decides whether a path is readable, so this
  cannot be true in one command and false in another.
- **D2: Counted, never silent (2026-08-06).** Anything skipped is reported.
  Silently dropping input is worse than failing because the number that comes
  out still looks right.
- **D3: Output cannot drive the terminal (2026-08-06).** Transcript content
  reaches a terminal only after every C0 control byte and DEL is flattened. The
  corpus contains arbitrary shell output. An unescaped title-set sequence in a
  stored line would otherwise execute on display.
- **D4: Drift fails toward visible overcount (2026-08-06).** Where a semantic
  rule must classify unknown input, it errs toward counting. Format drift then
  shows up as a number that is too large (noticeable) rather than as records
  quietly disappearing.
- **D5: Externally-derived counts are clamped (2026-08-06).** Any value from a
  transcript is range-checked before a narrowing conversion. The conversion is
  the specific hazard D1 does not cover. Converting an out-of-range float to an
  integer is checked undefined behavior, so the failure is a process abort at
  the instruction rather than an error the read boundary can catch.
- **D6: Non-transcripts are rejected rather than partially parsed (2026-08-06).**
  Files that fail format detection are skipped with a warning. Harnesses write
  other JSONL into the same trees, and half-understanding those files would
  produce plausible wrong aggregates.
- **D7: Codepoint and grapheme boundaries survive truncation (2026-08-06).**
  Byte caps land on codepoint boundaries, never mid-sequence.
- **D8: Parser changes clear a differential bar (2026-08-06).** A green test
  suite is necessary and not sufficient. A change to detection or extraction is
  landed by running the previous and new binaries over one frozen file
  snapshot and diffing. Everything the change did not intend must be identical.
- **D9: sess owns semantics rather than aggregation (2026-08-06).** What a turn *is*,
  what one API request *is*, and which lines are transport are the product.
  Grouping, filtering, and arithmetic over the result are not, and a general
  query engine does them better.

## Expected behaviors

Four commands:

| command | answers | output bounded by |
|---|---|---|
| `stat <file\|dir>…` | per-session summary and totals | session count |
| `tools <file\|dir>…` | tool-call frequency and failure rate | distinct tool names |
| `tail [-n N] <file>` | the last N events of one session | `N` events, each up to one line per content block |
| `grep [-m N] <text> <file\|dir>…` | where a string appears, with context | `-m`, default 200 matches; `-m 0` lifts it |

Directories are walked recursively for `*.jsonl`. Format is detected per file.
Times are UTC.

`grep` caps printed matches but does not stop scanning at the cap, so the total
it reports is the true total rather than where it stopped looking. Uncapped, a
search across a whole corpus produced 11.4 MB over 47,786 lines where `stat`
over the same input produced 137 KB. That output grows with the input rather
than with the question, which is the one thing this tool exists to avoid. `-m 0`
restores the uncapped behavior for callers piping into other tools.

`stat` reports start, duration, format, turns, API requests, tool calls, tool
errors, the four token classes separately, cost, model, and file. Input tokens
are reported non-cached, so a warm session legitimately shows a small input
count beside a large cache-read count. Collapsing those into one number would
hide the thing most worth seeing.

Cost is reported only where a transcript records it. Where a harness writes no
cost field, the column is empty rather than estimated.

A turn is counted when a person wrote the line. Harness-injected lines that
reuse the user role (task notifications, session-control commands, and echoed
shell output) are excluded. Three markers identify them, and a line is
excluded if any applies: an explicit meta flag on the line; an explicit
machine-origin field where the format provides one; or a leading wrapper tag,
which is how injections that predate those fields mark themselves. Lines
carrying tool-result blocks are transport and were already excluded. Per D4, an
unrecognized wrapper still counts.

All three markers are load-bearing, and none is redundant. The conformance
harness was first written against a version of this paragraph that omitted the
meta flag, and immediately disagreed with the tool. That is the intended
failure mode. A rule that is in the code but not written down is a rule that
would not survive a rebuild.

## Deliberately not in scope

- **A query language, filters, or aggregation flags.** The measurement was made
  on 2026-08-06. A general columnar engine reading the same JSONL reproduced
  every numeric `stat` column exactly and ran faster. Adding `--since`,
  `--model`, or grouping flags would duplicate something already available and
  do it worse. Each one would also need its own correctness story. The seam in
  D9 is the answer instead.
- **Shipped price tables.** Cost estimation for formats that record no cost is
  legitimate scope only with externally supplied prices. Prices embedded in the
  tool go stale silently, and no test can catch a number that is merely out of
  date.
- **Speculative format support.** A format is added when a harness is in daily
  use rather than in anticipation. Each format carries a permanent cost: an extractor,
  a fixture corpus, and a drift alarm somebody has to keep honest.
- **Writing, editing, or moving transcripts.** sess is strictly read-only. It
  reads files another program is actively appending to, and a diagnostic tool
  that can corrupt its own evidence is not one.
- **Following a live session.** Transcripts are appended continuously and a
  partial trailing line is normal. Reporting on a moving target invites answers
  that were true for no complete state.
- **An interactive interface.** Output is a stream to standard output so it
  composes with other tools and lands in a context window unchanged.

## Verification spine

**Oracles.**

- *The committed fixture corpora* (`src/testdata/`) hold one sample of every
  known line type per format, asserted to exact counts. They are the
  format-drift alarm. When a harness changes shape, these go red.
- *The previous binary* is the differential oracle for parser changes, per D8.
- *An independent query engine* is the second-derivation oracle, implemented as
  the external harness in `harness/`, and the highest-value review lever
  available. It re-derives every number through a different engine and a
  different author. Any engine that reads JSONL directly and aggregates in SQL
  will serve. Three requirements make it independent rather than decorative:
  the queries are written from the transcript format and never from this
  implementation; format detection is re-derived rather than read off the
  tool's own output; and the queries read untyped JSON per line rather than an
  inferred schema. A field absent from one file must read as null instead of
  failing to bind because absent fields are normal in a drifting format.

**Hostile input.** Fuzz entry points cover format detection and both
extractors. A fixed-seed mutation sweep over the committed corpora runs on every
test invocation and asserts D3, meaning that no rendered snippet can emit a
terminal control byte. The seed is fixed rather than drawn per run so a failure
stays reproducible.

**Freezability.** *If this tree vanished, what would rebuild the behavior?*
Four artifacts outlive the implementation and together answer yes for the
numeric behavior: this document, the committed fixture corpora, the SQL
oracles in `harness/queries/`, and the harness that drives the real binary
through its real command-line interface. A rewrite in another language can be
checked against all four without reading a line of the original.

The answer is not yet yes for everything. Rendering (column layout, the
humanized number formats, and the `tail` and `grep` line shapes) is pinned only
by in-language tests and by the harness's own re-implementation of the number
formats. Extending the harness to compare rendered output byte-for-byte against
recorded goldens is the remaining work, and is what would make the answer
unqualified.

The harness has already earned its place. On its first run it disagreed with
the tool about the fixture corpus, and the tool was right: the SQL had been
written from the documented turn rule, and that rule had omitted a marker the
code always honoured. A rule living in the implementation and nowhere else is
exactly what fails a rebuild, and nothing but a second derivation would have
found it.

## Structure

Capability layers, in dependency order. They currently live as banner-separated
sections of one module. The layer boundaries are the design's rather than the
file system's. The module's sections do not appear in this order, and detection
and normalization share a single banner. The current rule is that the module
stays whole until the normalization layer gains a third consumer.

1. **Path collection:** argument and directory walking to a file list.
2. **JSON access:** total accessors over parsed values that return a default
   rather than failing, implementing D1 and D5 at the point of use.
3. **Timestamp parsing:** civil-date arithmetic and ISO parsing. It serves
   both semantics (session duration) and rendering, which is why it is its own
   layer rather than a rendering helper.
4. **Format detection:** leading-line inspection to a format, or rejection
   (D6).
5. **Normalization:** per-format extractors producing Facts. The seam of D9.
6. **Iteration:** file reading and per-line arena management, yielding Facts
   and counting parse failures (D2).
7. **Rendering:** the four commands, plus the humanizing, name-flattening and
   text-flattening helpers that implement D3 and D7.
8. **Verification:** fixture corpora, contract tests, fuzz entry points, and
   the seeded mutation sweep.

A Facts emitter would attach at layer 7 as a peer of the renderers, consuming
the same seam, and would be the third consumer that triggers the split.

## Provenance

- **Turn-definition census, 2026-08-06.** A census of the live corpora
  established that roughly 30% of lines counted as prompts in one format were
  harness-injected rather than human, and fixed the classification rule and the
  fail-toward-overcount posture recorded in D4.
- **Aggregation boundary evaluation, 2026-08-06.** A general columnar query
  engine was trialled against sess on the same corpus. It reproduced the
  aggregates exactly and faster, but only by reimplementing every semantic
  judgment in per-format queries, and it defaults to aborting a whole scan on
  one malformed line. That result produced D9, the scope exclusions above, and
  the second-derivation oracle in the verification spine.
- **Cross-harness cost tooling survey, 2026-08-05.** No existing tool unifies
  local transcripts from multiple harnesses for token and cost accounting.
  This informs the conditional scope for cost reporting rather than a
  commitment to build it.
