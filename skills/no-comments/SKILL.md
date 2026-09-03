---
name: no-comments
description: "Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints."
disable-model-invocation: true
---

# No comments

Spawn Comment Sicko and act on its accepted flags. Authoring agents defend their own
comments, so defer to Comment Sicko's fresh perspective.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch
(default `main`), including the working tree.

## Steps

1. Spawn Comment Sicko with the `delegate` tool (`agent: comment-sicko`). Pass the scope;
   its agent definition already carries its rules.
2. Judge its report. Reject scope escapes, kills a keep exception protects, misstated
   `MUST KILL` reasons, and flags that treat kept intentional code as guilty. Reshape
   flags on our-code surprises stay actionable, and their comments still die. A keep
   survives only with proof it is about something we cannot change, and overruling a kill
   takes the exact exception plus scoped proof. Audit for scoped lint and TypeScript
   suppressions the report missed; correctness or safety suppressions stay actionable
   `MUST KILL`s. Before accepting a thin `IMPORTANT` or `do not remove` kill or keep, run
   `/how` or `/why` on its symbol. An ambiguous kill stands. Delete a refuted or
   still-ambiguous keep. Rerun one rejected report with the failure named. If the rerun
   also fails, report it open and fail `/no-comments`.
3. Apply the accepted deletions. Fix trivial accepted flags directly by deleting a dead
   path, dropping a parameter, or using the real API. When a fix needs a shape, sketch it
   once for the whole accepted set and its surrounding code, then stop; step 4 implements
   the sketch.
4. Implement the smallest root-cause fix in scope and remove every named workaround. If
   the root cause is out of scope, land the smallest in-scope fix and report the rest
   open. The guiding intent: fix real causes, redesign as if the requirements always
   existed, never bolt on symptom guards. That intent authorizes neither widening the
   fence nor fixing instances outside it.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before
   changing`. Leave keeps about things we cannot change. For the rest, offer the cheapest
   in-scope type, runtime check, test, or CI lint, and wait for interactive approval
   (unattended and eval runs take caller pre-approval). If approved, encode then delete.
   Otherwise delete, report the constraint open, and sketch the out-of-scope work.
6. Report the deletion count, rejected flags, reruns, the design sketch, fixes, encoding
   offers, encodings, unenforced constraints, and other open work.
