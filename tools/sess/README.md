# sess

Session-trace autopsy for agent transcript JSONL files. Reads Pi session logs
(`~/.pi/agent/sessions/**`) and Claude Code project transcripts
(`~/.claude/projects/**`), with the format auto-detected per file, and answers
the questions a raw multi-megabyte transcript makes expensive: what happened,
how long, how many tokens, which tools, what failed.

Agents (and the owner) call this outboard tool instead of loading transcript
JSON into a context window.

## Usage

```
sess stat  <file|dir>...        per-session summary table + totals
sess tools <file|dir>...        tool-call frequency and failure table
sess tail  [-n N] <file>        last N events of one session (default 10)
sess grep  [-m N] <text> <file|dir>...
                                case-insensitive content search
```

`grep` prints at most 200 matches by default and reports the true total it
found. `-m N` sets the cap, and `-m 0` lifts it. Uncapped, a search across a
whole corpus produces megabytes. That output grows with the input rather than
with the question, which is the thing this tool exists to avoid.

Directories are walked recursively for `*.jsonl`. Times are UTC.

```
$ sess stat ~/.pi/agent/sessions/<cwd-slug>/
START            DUR FMT TURNS   API TOOLS  ERR      IN     OUT  CACHE_R  CACHE_W     COST  MODEL        FILE
07-13 04:35   55m26s pi      1    75    93    1    352k   33.8k     5.8M        0    $5.68  gpt-5.6-sol  2026-07-13T04-35….jsonl
```

Column notes:

- `TURNS` = human prompts.
- `API` = model requests. Claude Code writes one line per content block. These
  lines are deduped by requestId.
- `IN` is non-cached input tokens, so a warm Claude session legitimately shows
  tiny `IN` next to a large `CACHE_R`.
- `COST` comes from Pi's per-turn cost records. Claude transcripts carry no
  cost field.

### What counts as a turn

A `user` line is a turn when a person actually wrote it. Not every `user`
line qualifies because harnesses reuse that role as transport. On the live
Claude corpus, 30% of them were machine-written (task notifications, the
`/clear`-style session commands, and the echoed output of `!` shell
commands). Those are excluded by three signals. A line is excluded if any
applies:

- `isMeta:true`, which Claude Code sets on injected caveat lines
- `promptSource:"system"`, which it stamps on lines it generated
- a leading wrapper tag (`<task-notification>`, `<command-name>`,
  `<local-command-stdout>`, `<bash-input>`, `<system-reminder>` and their
  siblings), which is how older lines and every pre-`promptSource`
  transcript mark themselves

Lines carrying `tool_result` blocks were already transport and stay so. A
wrapper the tool does not recognize still counts, so format drift surfaces
as a visible overcount rather than as silently missing turns. The committed
fixture corpora are the alarm for it.

Pi transcripts show no injected user lines today, and the same rule applied
to them changes nothing, verified across the 873 sessions on the development
machine when the rule landed.

## Build

```
zig build -Doptimize=ReleaseSafe    # pinned toolchain: zig 0.16.0
zig build test
```

The kit's `bin/install` builds and links the binary. For a development loop,
the equivalent by hand is `ln -sf $(pwd)/zig-out/bin/sess ~/.local/bin/sess`.

## Verification

Aggregates are cross-checked against `jq` ground truth on real transcripts of
both formats: prompt, turn, tool, and error counts, plus all four token sums,
with an exact match. They are also checked with a sweep of the development
machine's `~/.claude/projects` (940 sessions, 472 MB, about 2 s).
Malformed lines are counted and skipped and are never fatal. Unrecognized
`.jsonl` files are skipped with a warning on stderr.

Committed fixture corpora (`src/testdata/`) carry one sample of every known
line type per format and are asserted to exact counts, so a harness changing
its transcript shape turns a test red. Format detection is pinned by contract
against every leading line type observed across the live corpora, including
the non-transcript `.jsonl` that shares those directory trees (subagent
workflow journals, context-fold indexes), which must stay rejected. Hostile
input is covered by `std.testing.fuzz` entry points over detection and the
extractors, plus a fixed-seed mutation sweep of the corpora that runs on every
`zig build test` and asserts no display snippet can emit a terminal control
byte.

Parser changes are held to a stricter bar than a green suite. Run the old and
new binaries over the same file snapshot and diff. The turn-counting change
above was landed against 1,773 real sessions with every other column
byte-identical.

The external conformance harness (`harness/`) is the independent oracle. It
drives the real binary and checks every numeric `stat` column against the same
aggregates re-derived in SQL from the raw transcript, written from the formats
rather than from the implementation. Run `harness/conformance.py` for the
fixture corpora, or pass real transcript paths.

`DESIGN.md` states the thesis, doctrine, and scope boundaries this tool is
built against, including what it deliberately does not do.

## Repository

This tool lives in the agent kit at `tools/sess`. Commit there. The kit's
`bin/install` builds it and links the binary into `~/.local/bin`.
