---
name: prototype
description: "Build throwaway code that answers one named design question before real effort is committed: does this state model hold, does this approach perform, what should this look like. Use when a spec or grilling session hits a fork that arguing cannot settle, or when the owner wants to feel an idea before investing in it. The verdict survives; the code does not."
---

# Prototype

A prototype is throwaway code that answers a question. Name the question in
one sentence before writing anything, because the question decides the
shape, and a prototype without one is just unreviewed product code.

## Question shapes

- **"Does this logic or state model feel right?"** Build the smallest
  driver that pushes the model through the cases that are hard to reason
  about on paper: a CLI repl, a test file of scenarios, or a single HTML
  file with buttons if the owner should drive it by hand. Print the full
  relevant state after every action so the behavior is visible.
- **"Is this approach fast enough / feasible at all?"** A spike: hardcode
  everything except the one risky mechanism, measure it with real-shaped
  data, report the number against the budget.
- **"What should this look like?"** Several genuinely different variants
  behind one toggle, not one variant with three color schemes. The point is
  to compare shapes.

## Rules

1. **Throwaway from the first line, and marked as such.** It lives in the
   unversioned `spikes/` directory (or the scratchpad for anything the
   owner will not run), never in `src/`, and its name says prototype.
2. **Trivial to run.** One command, stated when you hand it over. If the
   owner has to think to start it, it will not get driven.
3. **No persistence, no polish.** State lives in memory; no tests, no error
   handling beyond runnability, no abstractions. Every hour spent hardening
   a prototype is an hour spent on code that is about to be deleted.
4. **Timebox it.** A prototype that grows past a session without answering
   its question is answering a different question; stop and rename the
   question or kill it.
5. **Capture the verdict, delete the code.** The answer (the question, the
   verdict, the number or the chosen shape) goes into the spec's Decisions,
   an ADR if it passes the three tests, or the grilling conversation. If a
   snippet encodes the decision more precisely than prose (a reducer, a
   schema, a state machine), inline that fragment in the spec and note it
   came from a prototype. Then the prototype dies in `spikes/` or on a
   throwaway branch; main keeps only the validated decision.

## The trap this skill exists for

The expensive failure is promoting a prototype: "it already works, let's
keep it." It works for the demo path with no tests, no error handling, and
no gate. The rebuild through `build` is cheaper than hardening a demo, and
the prototype already paid for itself by settling the design question.
