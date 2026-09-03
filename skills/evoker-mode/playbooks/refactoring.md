### Refactoring

**You own the contract: the structure changes, the behavior does not.** For "refactor",
"rename", "extract", "inline", "dedupe", "move this module". A cleanup that reveals a
missing feature or a real bug splits it out and ships the structural change first against
the pinned contract.

1. Pin the behavior first. Run the `how` walkthrough (`~/.agents/kit/prompts/how.md`) over the subsystem, then write a characterization
   test, snapshot, or equivalence harness capturing current behavior before any structure
   moves (prove-it-works). Type check and lint are not a pin.
2. Name the structure the code is missing (model-the-domain): a state machine over
   scattered booleans, a table over spread-out branching, a typed model over repeated
   shape assumptions. The reshape must delete branches or invalid states, not add
   indirection.
3. Name the target shape: what the layout, types, and call graph should be if built today
   (foundational-thinking, redesign-from-first-principles). A contested shape gets the
   Prototype playbook or Interrogate before the move.
4. Subtract before you add: delete dead weight, collapse one-caller wrappers, drop
   redundant validators before introducing the new shape. The smallest change that reaches
   the target ships (laziness-protocol).
5. Move in small behavior-preserving steps, each keeping the pin green. For API reshapes,
   migrate every caller and delete the old API in the same wave
   (migrate-callers-then-delete-legacy-apis). No shims, no parallel old-and-new paths.
   Spot-check renames against strings, prose, and back-references.
6. Prove behavior unchanged on the real artifact: an old-vs-new output diff, a replayed
   baseline, or a smoke run on the real surface. Name the blast radius: who else consumes
   what moved, proven by running it, not asserted.
7. Confirm the change earns its place: fewer layers between question and answer, less
   hidden state (minimize-reader-load). A diff that does not lower reader load somewhere
   gets reverted.
8. Commit as ordered slices that tell the story: subtraction, then reshape, then cleanup,
   each green before the next (sequence-verifiable-units).

**Reply:** the structure that changed, the pin it was held against, the equivalence proof,
the reader-load delta, and what got reverted. No new behavior.
