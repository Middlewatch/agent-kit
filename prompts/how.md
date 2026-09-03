---
description: Architectural walkthrough — how does X work, where should this live
argument-hint: "[question]"
---
Explore the codebase and answer this architecture question: $@

If the question above is empty, ask me for it before exploring. Produce a clear
architectural explanation at the level of a senior engineer onboarding onto a
subsystem: enough to build a full working conceptual model, not just annotations
I can read in the source.

Two modes. Explain is the default; run Critique when I ask for issues, problems,
or improvements rather than just understanding.

## Explain mode

**1. Frame and assess complexity.** Parse the question and use it to frame the
exploration. If the scope is ambiguous, state your best-guess interpretation and
begin; I will redirect mid-flight if you are off course.

- **Simple** (a single module, a small utility, "how does function X work"):
  explore and explain yourself in root context — briefing a child costs more
  than reading a handful of known files, per the delegation standard. Go to
  step 3.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting
  feature, a full architectural overview): fan out explore children first.

When in doubt, keep it simple; follow-up turns and fan-out stay on the table if
the first pass proves thin.

**2. Explore (complex questions only).** Decompose the question into 2-3
exploration angles, each a distinct slice of the subsystem so explorers don't
duplicate work (e.g. for a rate limiter: data model and state; request path and
enforcement; configuration and metrics). Launch all explorers with the
`delegate` tool in a single message, `explore` profile, scoped to the relevant
tree. Each brief carries the base prompt from
`~/.agents/kit/prompts/how/explorer-prompt.md` plus its specific angle. Each
explorer starts broad, follows the thread from an entry point through the call
chain, reads the actual code, and stops when it can describe the full path from
input to output without hand-waving.

**3. Synthesize.** Write the explanation yourself from the explorer findings
(or your own direct read), following
`~/.agents/kit/prompts/how/explainer-prompt.md` for the communication style and
output format. Reconcile overlapping findings, verify any load-bearing or
contested claim against the source before repeating it, and record each
explorer's disposition with `assess_delegation`.

**4. Present.** The explainer guide's format is the product: a working mental
model plus the file map to start from.

## Critique mode

**1. Explain first.** Run the full explain flow; you must understand the
architecture before critiquing it.

**2. Launch critics.** 2-3 `review` profile children in one message; escalate
`tier` or `thinking` when the architecture warrants it. Build each brief from
`~/.agents/kit/prompts/how/critic-prompt.md`, giving each critic the
explanation, the relevant file paths, and the rubric at
`~/.agents/kit/prompts/how/critique-rubric.md`.

**3. Lead judgment.** You're a pragmatic lead, not an aggregator. Verify each
finding's evidence against the source, then categorize: **Act on** / **Consider**
/ **Noted** / **Dismissed**. Record dispositions with `assess_delegation`.
Present the explanation first and the critique verdict below it; the
explanation stands on its own.
