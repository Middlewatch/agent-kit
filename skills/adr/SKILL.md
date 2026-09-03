---
name: adr
description: "Trigger at the moment any conversation settles a choice that is hard to reverse, would surprise a later reader, and had real alternatives, including ad-hoc planning and design debates outside a formal spec or build session; also when asked to record, supersede, or look up a decision."
---

# ADR: architecture decision record

An ADR is one decision, one file, written when the decision is made. The set of ADRs is
the project's "why is it like this" history.

## Outcome and boundaries

Success is one new file `docs/adr/NNNN-<slug>.md` that a stranger can read in under a
minute and come away knowing what was decided and why. The skill does not write specs,
plans, or glossaries, and it does not restate the README. An ADR is not a status document:
once accepted it changes only by a new ADR that supersedes it.

## When to write one

All three must hold, otherwise skip it:

1. **Hard to reverse.** Changing course later costs real work.
2. **Surprising without context.** A reader of the code would ask "why on earth did they
do it this way?"
3. **A real trade-off.** There were genuine alternatives and one was chosen for
specific reasons.

Qualifying examples: language or runtime choice, storage engine, process model,
wire-format freezes, a deliberate deviation from the obvious path, a scope boundary ("X is
out, because Y"), a rejected alternative likely to be re-proposed. Not qualifying: library
picks that swap in an afternoon, naming, anything the code itself makes obvious.

During a grilling or design conversation, offer the ADR the moment the decision
crystallizes ("want me to record this as an ADR so it doesn't get re-litigated?"). Do not
batch them to the end of the session.

## Format

```markdown
# NNNN: <decision in one line>

Date: YYYY-MM-DD
Status: accepted            (proposed | accepted | superseded by NNNN)

## Context
Two to five sentences: the forces, what was being chosen between, why now.

## Decision
What we do. One or two sentences.

## Consequences
What gets easier, what gets harder, what we now owe.
```

Add `## Considered options` only when the rejected paths are worth remembering. Most ADRs
are under twenty lines. Number by scanning `docs/adr/` for the highest existing number and
adding one; create the directory on the first ADR.

## Superseding

Never edit an accepted ADR's Context, Decision, or Consequences. Write a new ADR, set the
old one's Status line to `superseded by NNNN`, and have the new one's Context name what
changed. The history stays readable as a sequence.

## Reading before deciding

Any skill that is about to make or propose a design choice in an area reads the ADRs for
that area first and does not re-litigate an accepted one without naming it. If an accepted
ADR is the thing in the way, say so and offer a superseding ADR rather than quietly
routing around it.
