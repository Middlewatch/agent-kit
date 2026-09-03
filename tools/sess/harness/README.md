# External conformance harness

```
harness/conformance.py [transcript ...]      # no args → the fixture corpora
```

Checks every numeric column of `sess stat` against an independent
re-derivation of the same numbers in SQL, computed from the raw transcript.
Exits non-zero on disagreement, and reports a skip rather than a pass when it
cannot run.

Requires `duckdb` on `PATH` and a built binary at `zig-out/bin/sess`. Any
engine that reads JSONL directly and aggregates in SQL would serve; DuckDB is
the one this is written against.

## Why this lives outside the implementation

The in-language tests in `src/main.zig` die with the tree. This suite, the
committed fixture corpora in `src/testdata/`, and `DESIGN.md` are the assets
that would survive it, enough to rebuild sess in another language and check
the result against what it used to do. That is the freezability standard the
design basis holds itself to, and this harness is the part that was missing.

It is also the project's second-derivation oracle: the highest-value review
lever available, because it re-derives every number through a different engine
and a different author. Three things are deliberately re-implemented here
rather than shared with the tool:

- **The SQL** (`queries/`) is written from the transcript formats, never from
  `src/main.zig`. A misreading of a format by either side shows up as a
  disagreement rather than as agreement on the same mistake.
- **Format detection** is re-implemented from the documented rule, not taken
  from the tool's own `FMT` column.
- **Number formatting** is re-implemented from the documented output contract,
  so the comparison is exact at any magnitude instead of tolerant.

## What it has already caught

On its first run it disagreed with the tool on the fixture corpus, and the
tool was right: the SQL had been written from the documented turn rule, and
that rule omitted the `isMeta` marker the code had always honoured. The rule
was in the implementation and nowhere else, precisely the kind of thing that
would not survive a rebuild. The documentation was corrected rather than the tool.

Run at scale it then hit a second one, this time about the oracle's own
method: schema inference binds top-level columns from whatever fields happen
to occur in a given file, so a transcript that never uses `promptSource`
failed to bind it at all rather than reading it as null. The queries now read
untyped JSON objects per line. Absent fields are normal in an undocumented
format, and an oracle that cannot tolerate them is measuring the wrong thing.

## Scope

Compares the nine numeric columns: `TURNS`, `API`, `TOOLS`, `ERR`, `IN`,
`OUT`, `CACHE_R`, `CACHE_W`, `COST`. It does not compare `START`, `DUR`, `FMT`
or `MODEL`. The first two depend on line ordering that a SQL scan does not
guarantee, and the latter two are checked by the in-language contract tests.
