---
name: build
description: "Build the slices in a spec (or a small agreed change with no spec). Use when the owner says build, implement, continue, or resume."
---

# Build:

**Write Code** - write code early, write code often, rewrite code if you need to but keep
writing it.

The commit history is the execution log. The spec's slice checklist is the status. There
is no separate log file, ledger line, review register, or amendment ceremony. Time goes
into code and the one review that has demonstrably caught defects.

## Outcome and boundaries

Success is every slice in the spec checked off, each by a commit whose message names the
slice; the gate green on the final tree; a review of the whole diff with its findings
fixed; living docs touched by the change updated in the same commits; and a short chat
report. The skill does not rewrite the spec's Outcome or Non-goals (that is an owner
conversation), and it does not write summary, notes, handoff, or report files into the
repo.

## Preconditions

A spec with slices, or for work under half a day, a two-sentence statement of intent the
owner has seen. Read the spec, `docs/adr/` for the area, `CONTEXT.md` if present, the area's rows in
`docs/FEATURE_MAP.md` and the entries they name in `docs/DATA_MODEL.md` if present, and
the real code before the first edit. Build to the data-model entry; a slice that would
change an entry's owner, lifetime, or boundary is a stop per that skill. Check the principle index (`../evoker-mode/SKILL.md`)
and read in full any principle file the slices' data shapes or boundaries trigger. Note
the base commit for the review diff.

## Procedure

Per slice, in dependency order:

1. **Orient.** Re-read the slice and the code it touches. If the slice needs a decision
the spec does not cover, make the call if it is reversible and note it in the commit
message; if it is not reversible or contradicts the spec, stop and ask.
2. **Red, then green, at the agreed seam.** Write the failing test at the seam the spec
named, watch it fail, write the least code that passes. Expected values come from an
independent source (spec, worked example, known-good literal), never recomputed the way
the code computes them. One test, one implementation, repeat. Where no seam reaches the
behavior, say so in chat; that is a design finding rather than a reason to test internals.
3. **Check fast while working.** Typecheck or compile, and the single test file, as often
as useful.
4. **Gate once.** When the slice is done, run the project's gate script one time. Green:
commit. Red: fix and run once more. A third red run is a stop-and-think rather than a loop.
5. **Docs in the same commit.** If the slice changed behavior a living doc describes
(README, a contract, a CLI reference), edit that doc now. Do not leave it for a later
pass.
6. **Commit and tick.** Message names the slice (`S3: ...`). Check the box in the spec in
the same commit.

At the end of the spec (or at a natural midpoint for a long one):

7. **One review.** Delegate a fresh-context review child with the diff range (`git diff
<base>...HEAD`), the spec, and the repo. Brief: (a) defects, races, and wrong behavior,
with a reproduction where possible; (b) spec conformance: requirements missing, scope not
asked for, requirements that look done but are wrong. Under 400 words each axis. The
review reads the diff rather than the plan, and this is the review that has caught the MAJORs in the
record.
8. **Fix and close.** Fix confirmed findings, run the gate once, commit.
   Push back in chat on findings you think are wrong; do not re-review
   unless the fix was large.
9. **Report in chat.** What landed, what the review caught, what is open.
   Mark the spec `Status: done`.

## Stops

- Destructive or outward-facing operations (force-push, publish, delete
  data, touch a remote) wait for the owner, per the global guide.
- A slice that cannot land green after two honest gate runs: stop, report
  what is failing and the hypotheses, do not widen the change to get past it.
- A spec conflict discovered mid-build: stop, name it, let the owner rule;
  then edit the spec with a dated note and continue.
