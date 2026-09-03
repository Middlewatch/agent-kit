---
name: deep-review
disable-model-invocation: true
description: "Read a bounded region of a codebase with a skeptic's eye and produce a findings artifact whose every entry survived a written refutation attempt, with any finding that later fails scrutiny withdrawn in the open. An honest clean report is a good outcome. Review only: it never edits product code. Use when the owner asks for a deep review or deep audit, an independent or critical review, a security or correctness sweep, a pre-handoff review, or a hard look at AI-generated code."
---

# Deep review

You are an independent reviewer. Your deliverable is a findings artifact that
tells the owner plainly what does not work: real defects, proven, with nothing
invented to fill space. Remediation is a separate decision the owner makes after
reading the findings, and it goes through the `spec` and `build` skills or an
explicit fix request.

## Rules

**Precision is the priority, and withdrawal is the procedure.** A fabricated,
exaggerated, or benign finding taxes trust in every other finding, because the
owner can no longer take any of them at face value. The refutation and refine
passes below exist to control that risk before the report ships. When a finding
is discovered to be wrong after it entered the artifact (on a re-check, at
apply time, or on the owner's read), withdraw it in place: mark it withdrawn
with the reason, re-check every finding that shared its evidence or reasoning,
and say so in the report summary. A quietly deleted finding is worse than a
withdrawn one.

**An honest clean report is a good outcome.** If nothing survived scrutiny,
report that the region is clean and stop. Manufacturing a finding to justify the
run is the only real failure mode here.

## 1. Declare the scope contract

Before reading anything, write the scope contract at the top of the findings
artifact. It has four parts:

- **Paths**: the exact files or directories under review, as globs or a list.
- **Depth**: full-read (every line of every file in scope) or seam-read
  (the boundaries, contracts, and error paths, with bodies read on demand).
- **Exclusions**: what is deliberately out, and why. Vendored code, generated
  code, and fixtures are ordinary exclusions. Stating exclusions clearly makes
  follow-up traces simpler.
- **Baseline**: commit hash from `git log --oneline -1`, plus the gate script
  result (pass/fail counts) if the project has one, otherwise a statement that
  it has none, so a later reader knows what state was reviewed.

The contract exists because "review the whole project, no exceptions" is a
promise no run can keep on a real codebase. A narrow region read
properly beats a wide region skimmed, and the contract is what makes the
narrowing visible instead of accidental. If the region is too large for one run,
say so and propose a split before starting.

## 2. Read for the depth you declared

At full-read depth, read whole files. Reading in small windows to force
thoroughness is a trap. It burns the context you need for the cross-file
reasoning where the real bugs live, and a model that has lost the top of the
file cannot check the invariant established there. At seam-read depth, read
the boundaries and error paths whole and pull bodies on demand. Depth comes
from the interrogation and the artifacts below.

What does stay non-negotiable is the artifact rule: **a step is done when you
have produced its artifact.** A read is done when you have stated what you
read. A verification is done when you have stated what you verified. If you
cannot produce the artifact, the step did not happen.

Artifacts accumulate on disk as you go rather than in your head. Append the scope
contract, per-file dismissal lists, and confirmed findings to the report file
as each step completes. A long review outlives the context window, and anything
held only in context is lost to compaction.

When a file looks boring or trivial (glue, config, imports, boilerplate), that is not
permission to skim. It is the signal that you are about to skip the file
everybody else skipped too, which implies an important finding may be hiding.

## 3. Interrogate against the following axes

These do not name bug classes. They force reasoning about how code behaves
under conditions it was not written for, and the bug surfaces as a consequence.

1. **Control flow**: for each branch, true, false, or errors while being
   evaluated. Are both sides reachable? Does each path leave consistent state?
2. **State**: who else touches this state, in what order, and what if they
   touch it while execution is paused here (`await`, yield, callback, signal
   handler, context switch)? What survives across calls, sessions, restarts?
3. **Resources**: for everything opened, allocated, locked, or subscribed, is
   it released on *every* path out, including error paths and early returns?
   Garbage collection is not an escape hatch.
4. **Failure**: after each error, is state safe or half-mutated? And where
   does the code swallow a failure and substitute a default (`||`, `??`,
   `catch {}`, empty handler, logged-and-ignored)? What is that default hiding?
5. **Origins**: where did each value come from (user input, external system,
   internal computation)? What values break this line, and can an untrusted
   source actually reach it?
6. **Types**: where is a type asserted without proof (a cast, an `as`, an
   `any`, `.?`, `unreachable`, an unchecked coercion)? What if it is wrong?
7. **Assumptions**: what must be true for this line to be correct, and is
   each of those things actually guaranteed by a caller, a type, a check, or
   an invariant? An assumption nothing enforces is a bug waiting for its input.
8. **Outside the frame**: what would break here that none of the seven above
   prompted? A bare "nothing outside the frame" is invalid. Either name
   something specific you followed, or give a reason grounded in this line's
   actual content. A justification that cannot be wrong is ceremony.
9. **Boundaries and ownership**: does this depend on code elsewhere, or does code
   elsewhere depend on it? Open the other side and check the contract: the
   precondition the caller assumes, the type the consumer expects, ownership
   of shared state, the error the other side will see. A contract assumed on
   one side and unenforced on the other is a finding, and it is invisible to
   any single-file read.

Language packs are an important resource. If `~/.agents/reference/coding-languages/<lang>/` exists,
read its `CONVENTIONS.md`. Every rule in it is a bug class that the estate has
already reviewed and resolved.

## 4. Review your dismissals

Margin bugs are rarely lost unseen. They are lost in the "probably fine"
moment: you saw it, something felt off, you moved on. That moment is the
signal to stop and review again.

Before leaving a file, list everything you considered and discarded, each with
its reason. A dismissal with no reason is drift rather than a decision. Writing
the reason down is what forces re-engagement, and a meaningful fraction of
dismissed candidates come back at this step because "I dismissed this because
X" makes it obvious when X is weak.

The inventory's depth scales with the file's risk rather than uniformly. A file
on a trust boundary or a hot state path gets the full accounting, and a trivial
re-export file gets a line. Uniform ceremony on every file spends the
re-engagement where it cannot pay.

An empty dismissal list on a non-trivial file is suspect. If nothing was
dismissed, say so and name what you almost dismissed and confirmed safe.

## 5. Prove or refute every candidate

Presume every candidate is a real defect, then argue the code's side as hard
as you can. Hunt for the concrete check, type, or invariant that would make
it impossible. Only a candidate that survives that argument is a finding.

- Point at exact lines rather than the function.
- Write the chain out end to end: entry point → precondition 1 → precondition
  2 → impact, each link verified against the actual code. A missing link means
  the trace is incomplete.
- Keep tracing until something concrete stops you: a check that actually
  blocks, a type that will not coerce, a state that cannot exist. Stopping
  because it felt done means you stopped early.
- Ask whether the author did this deliberately, and look for the reason.

The survival bar in practice:

- **Finding:** "the `u32` cast of `len` truncates uploads past 4 GiB.
  Survived because the only upstream bound is a config *default* rather than
  an enforced limit, and a caller can raise it."
- **Not a finding:** "this handler has no logging" has no defect chain from
  entry to impact. It is at most a NOTE, and only if the region's invariants
  actually need the trace.

## 6. Refine

Step 5 was still run in a bug-hunting frame, so confirmation bias survives
it. This pass flips the frame. Read each finding as the author who knows
something the reviewer does not, and answer in writing:

- **Is the line real?** Open the file at that offset. Does the code say what
  the finding claims?
- **Is the type what I claimed?** Check the actual signature.
- **Does the precondition hold?** Is the caller actually constrained that way?
- **Does the thing I relied on exist?** If you cited a test, does it exist? If
  you cited a runtime behavior, did you verify it?

A finding that stands without these answers was rubber-stamped.

On Pi, the frame-flip gets independent help: for each load-bearing finding,
delegate one `agent: "refuter"` child over the agent-delegate surface with
the finding's claim, the reviewed region as scope, and a small verdict
schema. A fresh judge-tier context that had no hand in producing the finding
attempts the disproof. Its verdict is evidence for this pass rather than a
replacement for it; the root stays accountable per
`~/.agents/kit/guidance/workflows/delegation-standard.md`. The same surface
serves the read side: a `critic` child can independently review a region you
have already reviewed, and disagreement between the two reads is itself a
signal worth chasing.

## 7. Try to demonstrate

Reasoning is not evidence. Before marking anything theoretical, attempt the
demonstration (write the input, run the test, make the call) and state in
the finding what you attempted and why it failed to trigger.

Demonstrations are non-destructive. Scripts go to the scratchpad rather than
into the reviewed tree, and run against a copy or a scratch instance. A
demonstration that mutates the state under review, live services, or
persisted data has itself become the incident.

## 8. Tools

A recurring failure is leaning on the existing test corpus and estate tooling
to prove conformance cheaply. Static analyzers are welcome and encouraged
but, before admitting any tool's output as evidence:

1. Run it on a file you have already read and understood in this review.
2. Compare its findings against what you know is true.
3. Record the result in the artifact, including the false positives.

A tool that misreads the language fails the gate and its output stays out of
the report. `references/tool-gate-incidents.md` holds the documented cases, including a syntactic analyzer that flagged 71
live functions as dead on one estate codebase. Read it when a tool's output
looks too good to gate.

## 9. Reconcile

The review is done when it is accounted for rather than when you run out of
findings.
Before reporting, reconcile against the scope contract from step 1:

- **Every file in scope**: reviewed at the declared depth, or named as not
  reviewed with a reason.
- **Every cross-file thread you opened**: traced to where the contract is
  established, or dismissed with a written reason.
- **Every dismissed candidate**: still accounted for, none lost between the
  per-file dismissal review and the final report.
- **Every tool run**: gated per step 8, with the gate result recorded.

A defect noticed outside the scope contract is neither reviewed nor discarded.
Record it in a one-line "Out of scope, observed" list in the report and move
on. Expanding scope mid-run breaks the contract, and dropping the observation
wastes it.

If the reconciliation exposes a gap, close it and account again. Report only
when it balances.

## Output

Write to `.local/artifacts/review-<YYYY-MM-DD>-<slug>/REPORT.md` in the
reviewed project, per `~/.agents/kit/skills/project-scaffold/references/project-layout.md`.
The report carries:

```markdown
# Deep review — <project> / <region>

**Scope contract**: <paths> · depth: <full-read|seam-read>
**Excluded**: <what, and why>
**Baseline**: `<commit>` — gate: <pass/fail counts>
**Date**: <YYYY-MM-DD>

## Findings

### [A-01] <one-line claim>  ·  <CRITICAL|MAJOR|MINOR|NOTE>
- **Where**: `path/to/file.ext:120-134`
- **Class**: <CWE or plain-language class>
- **Chain**: entry → precondition → precondition → impact
- **Survived because**: <the refutation you attempted, and why it failed>
- **Evidence**: <demonstrated: how | theoretical: what you tried, why it didn't trigger>
- **Fix direction**: <one or two sentences — not a patch>

## Dismissed

| Candidate | Where | Why it was dismissed |
|---|---|---|

## Out of scope, observed

- <one line each — noticed outside the scope contract, recorded, not reviewed>

## Tool gate

| Tool | Gate file | Verdict | Admitted? |
|---|---|---|---|

## Reconciliation

- Files in scope: N/N at declared depth (or: named exceptions)
- Cross-file threads: N traced, N dismissed with reason, 0 abandoned
- Dismissed candidates: N raised, N accounted for
```

Severity uses the house register defined in
`~/.agents/kit/guidance/workflows/freezable-workflow.md`
(CRITICAL / MAJOR / MINOR / NOTE). A NOTE (a missing direct test, a
maintainability concern) is held to the same refutation standard as any
finding but carries no fix obligation. Assign the severity the definition
supports rather than the one that justifies the run. An honestly labeled MINOR
is worth more than an inflated MAJOR. Code smells and style are not findings.
If the region needs a maintainability pass, record that as a single NOTE
naming `structural-review`, and a disagreement with a ratified `DESIGN.md`
gets a one-line note naming the governing document. The seam stays one line
in each direction, and the owner decides whether to open either.

For a clean region, the Findings section reads "none survived scrutiny" and
the Dismissed table and Reconciliation carry the weight of proof. A clean
report with an empty Dismissed table is a skipped review rather than a clean
one.

## Report back in product terms

Close with what the review means rather than what it did: which findings change
behavior the owner can observe, which are latent, what the region's overall health
looks like, and what you deliberately left out of scope. Name the single most
important thing first.
