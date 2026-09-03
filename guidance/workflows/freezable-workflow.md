# Freezable workflow

## Claim

The durable assets of a project are the externalized, executable description of its
behavior, such as: conformance harnesses, golden fixtures, replay corpora, fuzz seeds, and
written invariants. Code is a projection of that asset and can be regenerated in another
language, another architecture, or the same language with fresh eyes. Re-deriving every
line against an oracle is itself a potent review lever.

## Invariant

**if this tree vanished tonight, would the external artifacts suffice to rebuild this
project's behavior?**

## Assets

These artifact types live outside the implementation and survive any rewrite:

1. **External conformance harness**: a scripting-language suite that drives the real
   binary through its real interface (pty, socket, CLI, or replay driver). In-language
   unit tests can and should be written, but because they will invariably die with the
   tree, they do not count towards a freezeability metric.
2. **Golden fixtures**: byte-level pins on stored formats and wire shapes, proven
   behavioral spikes, checked in both directions.
3. **Replay / regression corpus**: every real-use defect becomes a replayable row (input
   script, corpus entry, recorded session).
4. **Fuzz seed corpora**: committed seeds, with each known bug class kept as a named
   regression seed.
5. **Doctrine document**: invariants in prose with dated rationale.
6. **Interface contracts**: frozen, language-neutral descriptions of wire protocols, file
   formats, and extension seams.
7. **Existing products/prior art**: when modeling a new product or project, locate and
   save existing reference material.

## The loop

Work lands in phases, ordered by good design logic. Generally, the phases with the
cheapest, most exhaustive gates (codecs, data structures, state machines) come before I/O
boundaries, which come before UI and polish.

Per phase:

1. The builder lands the phase with its gates in the same commit series.
2. An independent reviewer (fresh context) writes a finding register with severities from
   the house register.
3. A fix wave addresses the findings.
4. The fix wave is itself re-reviewed before close-out.
5. The same reviewer closes out the register.

## Where a rule lives

| Layer | Mechanism | What belongs here |
|---|---|---|
| 0 | Formatter (`gofmt`, `zig fmt`, `cargo fmt`) | Every cosmetic question. Formatting is settled by running the tool, and is never discussed again. |
| 1 | Linter, type checker, gate script | Anything mechanically checkable. This is the only layer with a measured causal effect on what gets produced. |
| 2 | `~/.agents/kit/skills/structural-review/references/structural-standard.md` | Cross-language structure that a gate cannot check and a generator would not choose unprompted. It is governed by that document's budget rule. |
| 3 | Language pack (`~/.agents/reference/coding-languages/<lang>/`) | Language-specific traps, earned from real incidents in that language. |
| 4 | In-repo exemplar (`examples/`, a reference implementation) | Novel patterns such as a server loop, a storage layer, or a C binding. It shows the shape rather than describing it. |

Two rules govern movement between layers.

- **A rule moves down as soon as it can be checked.** When a linter can enforce what prose
  was asking for, the prose is deleted rather than kept as a reminder.
- **Layer 4 does not replace layer 2.** An exemplar produces the strongest initial
  conformance, but its effect decays as work continues while a written directive persists,
  so novel patterns want both a worked example and the rule that explains it.

## Earned rules

Each is a review criterion earned over time. This is a lessons learned log.

- **Every new file lands with direct tests on its own layer.** (An Evoker review's one
  CRITICAL: a 1,400-line row-assembly file with zero direct tests, hidden behind green
  integration gates.)
- **Dropped or ported-away tests get written deferral notes.** (~38 Zig test blocks
  silently vanished in a port packet, and the review had to reconstruct what coverage was
  lost.)
- **Gate the real path, not a miniature.** (A latency gate measured a toy reimplementation
  while the app path went unmeasured.)
- **Test through the construction path, not just the leaf type.** (A by-field struct clone
  on an enforcement path silently dropped three security fields, and unit tests built the
  struct directly and stayed green over the hole.)
- **Prove gates can fail.** When adding a gate invariant, break the thing once and watch
  the gate go red before trusting the green. (House practice from the catalog gates and
  manual mutation testing.)
- **Notice other writers.** Parallel sessions in one tree are ordinary; when another
  session is active, keep commits surgical and rerun affected gates before trusting
  green. (A second session widened a shared type, updated one of three call sites, and
  broke a sibling package invisibly to its own gate.)

## Performance budgets as review gates

The standing product qualities that matter generally hold true for any coding project,
such as: it loads fast, stays small in memory, compiles fast, its data structures make
sense, and its code is comprehensible. Hold these as measurable goals and keep them
clearly defined in the project scope across rewrites.

- startup-to-usable wall time (hyperfine, fixed workload).
- resident memory after a defined reference workload (`/usr/bin/time -v`, heaptrack for
  regressions).
- clean-build and incremental-build wall time.
- hot-path allocation counts as hard CI gates where the toolchain offers them
  (`AllocsPerRun` in Go, allocation-failure injection in Zig).
- comprehensibility is gated by review plus a structural guide doc that the reviewer diffs
  against (deviations are findings). That doc is the `structural-review` skill's
  `references/structural-standard.md` and the review is that skill. "Data structures make sense" is its evidence-gated
  data axis, which stays silent where no hot path or budget is in play.

Budgets come in two tiers, and each budget states its tier when it is set. A budget is
enforced (a red CI gate) only when the measurement is deterministic, such as an allocation
count on a pinned code path or a byte-size cap. Timing and memory budgets are tracked.
They are set at first measurement and recorded across commits. A regression past the bar
is an investigation trigger (a finding that the review must explain rather than an
automatic failure). That is because wall time and RSS vary with machine and workload, and
a regression is sometimes the honest price of a feature. A tracked target is only relaxed
when improvement is ruled no longer possible.

## Second derivations

The rewrite value comes from re-derivation against an oracle.

1. **Dual implementations under one gate**: where a core component has a
   cheap second implementation (Dead Letter runs piece-table and array
   buffers through the same suite), keep both and diff them. Differential
   testing is continuous porting-as-review at zero process cost.
2. **Module-level rederivation**: when touching a module with pinned
   behavior, rewriting it from its spec is a legitimate alternative to
   patching it, and is the everyday form of the rewrite.
3. **Whole-system port**: used sparingly but justified when major architectural
   changes are proposed or when an honest analysis of the project indicates
   that a language change would be beneficial to it in the long term.

## Documentation discipline

Documentation lives in two strictly separated tiers:

- **Current-state docs** (README, specs, ADRs, `documentation/`) describe the
  present and carry no phase codes, packet numbers, or milestone narrative.
- **Append-only ledgers** (dated reviews, implementation plans, `docs/history/`, evidence
  under `.local/artifacts/`) preserve chronology and are never rewritten.

When a build closes, an `as-built` pass moves narrative out of the living docs and
leaves the current-state version of the project.
