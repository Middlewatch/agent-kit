---
name: deep-review
disable-model-invocation: true
description: "Independent findings artifact over a bounded code region, every finding refuted in writing first. Use when the owner asks for a deep review, audit, or a security or correctness sweep. Review only; the report is the deliverable."
---

# Deep review

The deliverable is a findings report: real defects in a bounded region, each one
traced to exact lines and refuted in writing before it ships. Remediation is the
owner's decision after reading it, through `spec` and `build` or an explicit fix
request. A clean report is a good outcome. A finding invented to justify the run
is the failure mode, because one bad finding taxes trust in every other one.

The report accumulates on disk as each step completes (scope contract, per-file
dismissals, findings), because a long review outlives the context window.

## 1. Scope contract

Write it at the top of the report file before reading anything:

- **Paths**: the exact files or directories under review.
- **Depth**: `full-read` (every line of every file) or `seam-read` (boundaries,
  contracts, and error paths whole; bodies on demand).
- **Exclusions**: what is deliberately out, and why. Vendored code, generated
  code, and fixtures are ordinary exclusions.
- **Baseline**: `git log --oneline -1`, plus the gate result (pass/fail counts)
  or a statement that the project has no gate.

When the region is too large for one run at the declared depth, say so and
propose a split before starting.

## 2. Read at the declared depth

At full-read depth, read whole files. The global guide's rule to script a flood
instead of reading it yields here: the reading is the work, and the scope
contract is what keeps it affordable. At seam-read depth, read the boundaries
and error paths whole and open bodies as a trace needs them.

A file that looks like glue, config, or boilerplate gets the same read. It is
the file everyone else skipped.

When `~/.agents/reference/coding-languages/<lang>/CONVENTIONS.md` exists for
the region's language, read it first. Each rule there is a bug class the estate
has already reviewed and resolved.

A step is done when its artifact exists: a read when you have written what you
read, a verification when you have written what you verified.

## 3. Interrogate

Ask of each unit, in writing where the answer is not obvious:

1. **Control flow**: is each branch reachable, including the path where the
   condition itself throws, and does each path leave consistent state?
2. **State**: who else touches this, in what order, and what if they touch it
   while execution is paused here (`await`, yield, callback, signal handler)?
   What survives across calls, sessions, restarts?
3. **Resources**: is everything opened, allocated, locked, or subscribed
   released on every exit, including error paths and early returns?
4. **Failure**: after each error, is state safe or half-mutated? Where does the
   code swallow a failure and substitute a default (`||`, `??`, `catch {}`,
   logged-and-ignored), and what is the default hiding?
5. **Origins**: where did each value come from, what values break this line,
   and can an untrusted source reach it?
6. **Types**: where is a type asserted without proof (cast, `as`, `any`,
   `unreachable`, unchecked coercion), and what if it is wrong?
7. **Assumptions**: what must be true for this line to be correct, and what
   enforces each of those things? An assumption nothing enforces is a finding
   waiting for its input.
8. **Outside the frame**: what would break here that the seven above did not
   prompt? Name something specific, or give a reason grounded in this line's
   content.
9. **Boundaries**: open the other side of every cross-file dependency and check
   the contract: the precondition the caller assumes, the type the consumer
   expects, ownership of shared state, the error the other side sees.

When the region is a recent change (a diff, a port, a new package), also apply
`references/change-review-criteria.md`: five incident-backed rules for new
files, dropped tests, gates, construction paths, and concurrent writers. On
settled code the last three still apply and the first two are NOTEs at most.

## 4. Review your dismissals

Before leaving a file, list every candidate you considered and discarded, each
with its reason. The depth of the list scales with the file's risk: a trust
boundary or hot state path gets the full accounting, a re-export file gets a
line. An empty list on a non-trivial file gets one sentence naming what you
almost dismissed and confirmed safe. Candidates that come back at this step
(because the written reason turned out weak) go to step 5.

## 5. Prove or refute each candidate

Presume the candidate is a real defect, then argue the code's side as hard as
you can: hunt for the check, type, or invariant that makes it impossible. A
candidate is a finding only when that argument fails.

- Point at exact lines.
- Write the chain end to end: entry point → precondition → precondition →
  impact, each link checked against the code.
- Trace until something concrete stops you: a check that blocks, a type that
  will not coerce, a state that cannot exist.
- Ask whether the author did this deliberately, and look for the reason.

The bar: "the `u32` cast of `len` truncates uploads past 4 GiB; survived
because the only upstream bound is a config default, and a caller can raise
it" is a finding. "This handler has no logging" has no chain from entry to
impact and is at most a NOTE.

## 6. Refine

Step 5 ran in a bug-hunting frame. Flip it: read each finding as the author who
knows something the reviewer does not, and answer in writing:

- Is the line real? Open the file at that offset.
- Is the type what I claimed? Check the signature.
- Does the precondition hold? Is the caller constrained that way?
- Does what I relied on hold? A cited test exists and covers the claim; a
  cited runtime behavior was observed, not inferred.

For each load-bearing finding (every CRITICAL and MAJOR, plus any finding whose
chain rests on a single inference), delegate one `agent: "refuter"` child:
task is the claim and its chain, scope is the reviewed region, `resultSchema`
is the verbatim content of `references/verdict.schema.json`. Its verdict is
evidence for this pass, and you stay accountable for the finding (root
obligations: `~/.agents/kit/extensions/agent-delegate/README.md`). Findings
outside that set get the written frame-flip only.

When a finding proves wrong after it entered the report (on a re-check, at
apply time, or on the owner's read), mark it withdrawn in place with the
reason, re-check every finding that shared its evidence or reasoning, and say
so in the summary.

## 7. Demonstrate

Before marking a finding theoretical, attempt the demonstration (write the
input, run the test, make the call) and record in the finding what you tried
and why it did not trigger. Scripts go to the scratchpad and run against a
copy or a scratch instance; the reviewed tree, live services, and persisted
data stay untouched.

## 8. Gate every tool

Before admitting any tool's output as evidence (a static analyzer, a dead-code
sweep, a test corpus, a generated map): run it on a file you have already read,
compare its findings with what you know is true, and record the result in the
report including the false positives. A tool that fails the comparison stays
out of the report. When a tool's output looks too good, read
`references/tool-gate-incidents.md` before trusting it.

## 9. Reconcile

The review is done when it balances against the scope contract:

- Every file in scope: reviewed at the declared depth, or named with a reason.
- Every cross-file thread opened: traced to where the contract is established,
  or dismissed with a written reason.
- Every dismissed candidate: still in the Dismissed table.
- Every tool run: gated per step 8, result recorded.

At full-read depth on a region where a CRITICAL is plausible (a trust boundary,
a persistence path, an enforcement path), run one `agent: "critic"` child over
the scope contract before reconciling. A finding it raises that you dismissed,
or a dismissal it makes of a finding you kept, goes back through step 5.

A defect noticed outside the scope contract goes in the "Out of scope,
observed" list, one line, unreviewed. Close any gap the reconciliation exposes,
then report.

## Output

Write `.local/artifacts/review-<YYYY-MM-DD>-<slug>/REPORT.md` in the reviewed
project (layout per
`~/.agents/kit/skills/project-scaffold/references/project-layout.md`):

```markdown
# Deep review: <project> / <region>

**Scope contract**: <paths> · depth: <full-read|seam-read>
**Excluded**: <what, and why>
**Baseline**: `<commit>`, gate: <pass/fail counts>
**Date**: <YYYY-MM-DD>

## Findings

### [A-01] <one-line claim>  ·  <CRITICAL|MAJOR|MINOR|NOTE>
- **Where**: `path/to/file.ext:120-134`
- **Class**: <CWE or plain-language class>
- **Chain**: entry → precondition → precondition → impact
- **Survived because**: <the refutation attempted, and why it failed>
- **Evidence**: <demonstrated: how | theoretical: what was tried, why it did not trigger>
- **Fix direction**: <one or two sentences, direction only>

## Dismissed

| Candidate | Where | Why it was dismissed |
|---|---|---|

## Out of scope, observed

- <one line each>

## Tool gate

| Tool | Gate file | Verdict | Admitted? |
|---|---|---|---|

## Reconciliation

- Files in scope: N/N at declared depth (or: named exceptions)
- Cross-file threads: N traced, N dismissed with reason, 0 abandoned
- Dismissed candidates: N raised, N accounted for
```

Severity:

- **CRITICAL**: wrong behavior, data loss, or a security hole reachable in
  normal use, or a gate that passes over a defect it claims to cover.
- **MAJOR**: wrong behavior under a realistic but uncommon condition, or a
  contract violated across a boundary.
- **MINOR**: a bounded, recoverable defect, or a correct path that depends on
  an assumption nothing enforces.
- **NOTE**: a missing direct test or a maintainability concern; same
  refutation standard, no fix obligation.

Assign the severity the definition supports. Style and code smells are not
findings: a region that needs a maintainability pass gets one NOTE naming
`structural-review`, and a disagreement with a ratified `DESIGN.md` gets one
line naming the document. For a clean region, Findings reads "none survived
scrutiny" and the Dismissed table and Reconciliation carry the proof; an empty
Dismissed table means the review was skipped.

## Report back

Close in product terms, most important thing first: which findings change
behavior the owner can observe, which are latent, the region's overall health,
and what was deliberately left out of scope.
