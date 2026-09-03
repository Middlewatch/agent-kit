---
name: spec
description: "Grill the owner until the design tree is settled. Use for a new project, a feature, or a pivot that will take multiple sessions to settle. Also useful when working through vague brainstorming sessions or when the user wants to think through a problem."
disable-model-invocation: true
---

# Spec: grill, then write it down once

One conversation produces one document. The rigor is in the interview, grill the user
relentlessly until you have reached a shared understanding of what the spec is supposed to
look like. Generate a SPEC.md file that describes what was settled.

## Outcome and boundaries

Success is `docs/specs/YYYY-MM-DD-<slug>.md` the owner has read and said "build it" to,
plus any ADRs written during the grilling. For a brand-new project, success also includes
a README carrying the thesis and non-goals and a scaffold (`project-scaffold`) so the gate
exists before product code. The skill writes nothing else into the repo. Scratch,
transcripts, and working notes go to `$PI_SCRATCHPAD` and are not committed.

If the user considers this a brainstorming or unstructured session to think through a
problem, then continue with the interview and workflow and then ask what workspace this
session and spec document should live in.

## Procedure

1. **Read what exists.** README, `docs/adr/`, `CONTEXT.md` if present, the area's rows in
`docs/FEATURE_MAP.md` and their entries in `docs/DATA_MODEL.md` if present (intended rows
included; a row whose data is `?` routes to `data-model` before the spec), and the code in
the area. Look up facts yourself (delegate an explore child for breadth).

2. **Grill in rounds.** Map the decisions as a tree. The frontier is every question whose
prerequisites are already settled; ask the whole frontier each round, then recompute. A
round is one `ask_user_question` call. A genuinely open-ended question (naming, "what is
the actual claim?") goes in chat prose instead. Two to four rounds is typical but use as
many rounds as required. Keep asking until the claim fits in one falsifiable sentence with
an acceptance test a build could fail. The grilling is done when nothing material is
silently assumed. Do not act until the owner confirms the shared understanding.

3. **Write the spec.** One pass, synthesized from the conversation, using the template
below.

4. **Put it to the owner in chat.** The spec path plus the two or three choices that carry
consequences. Fold rulings into the spec and create a fully conformed document.

## Spec template

```markdown
# <slug>

Date: YYYY-MM-DD   Status: draft | building | done

## Problem
What is wrong or missing, from the user's point of view. Two to five sentences.

## Outcome
The falsifiable claim and the test that decides it. "Replay a recorded
session byte-identical at 10x speed; the replay diff is empty."

## Non-goals
Named temptations, each with the reason it stays out.

## Decisions
Implementation decisions that came out of the grilling: modules touched,
interfaces changed, schema or contract changes, with a pointer to the ADR
where one exists. No file paths or code snippets unless a prototype
produced a shape prose cannot carry.

## Seams under test
The public boundaries the tests will drive, and which existing tests are
prior art. Prefer one high seam over many low ones. Confirmed with the owner.

## Slices
Vertical tracer bullets, each demoable on its own, each sized to one
session, in dependency order. Checked off as the commit that lands it
arrives.

- [ ] S1 <behavior this slice makes work>
- [ ] S2 <...> (after S1)

## Open questions
Anything the owner deferred, with what it blocks. Dated notes on spec
changes made during the build.
```

## Sizing

- Appears small and the direction is obvious: no spec. Say what you are about to do in two
  sentences and build.
- Covers a few session or you aren't sure: use this skill, create one spec.
- Bigger than a few sessions, or fog-bound: still one spec, but the slices are coarse and
  the first one is a walking skeleton; the later slices get re-cut when the skeleton
  exists. Do not plan the whole tree upfront.

If the user disagree's with your framing assume they will interject and redirect.

## Decisions and blockers

- The owner rules on the outcome, the non-goals, the seams, and any ADR. Everything else
  is the agent's call, stated in the spec.
- A thesis that will not converge after honest grilling is a valid stop: report the open
  forks and do not write a spec over them.
- Conflicting authorities (an ADR against what the owner just said) are named, not
  resolved silently.
