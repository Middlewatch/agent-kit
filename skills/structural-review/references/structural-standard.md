# Structural standard

This is the house standard for code structure. It covers how things are named, shaped,
owned, and laid out.

## Claim

Code is read far more often than it is written, and on this estate it is read mostly by
people and agents who did not write it, such as the owner returning to a project after a
month, a fresh-context reviewer, or a rewrite deriving the same behavior in another
language. An external artifact can describe behavior but only legible code lets someone
confirm that the projection matches.

## What counts as a deviation

A deviation names a cost and may come in the below forms:

1. **Someone already paid**: a caller misuses it today, and the call site is cited. This
   is the strongest form, so look for it first.
2. **A likely change is expensive**: name the change and what it would touch.
3. **A reader draws a specific wrong inference**: name the inference rather than "this is
   confusing."
4. **A measured budget is at risk**: a performance budget, with the measurement.

"It would be cleaner," "this is not idiomatic," and "consider renaming" with no cost
attached are not deviations. They are taste, and taste that cannot name a cost loses to
the code that exists.

## Structure of existing codebases

**The local idiom outranks the reviewer's preference.** In general where a project or
language pack has settled on a convention, consistency with it is the standard, even when
the reviewer would have chosen differently. Sometimes the user will direct a critique of
the locally adopted standards and idioms and that is when an opionated review is warranted

**Consistency is not a defense either.** An established pattern that names a cost under
the four forms above is still a deviation, and being everywhere does not make it free.
There are three cases, distinguished by evidence rather than conviction:

- **No dominant pattern**: the codebase does it three ways. The inconsistency is the
  finding, so propose one way.
- **A site departs from the dominant pattern**: an ordinary finding with a local fix.
- **The dominant pattern is itself is the problem**: the case where changing the idiom is
  the solution.

## Axis 1: Names

A name states what a thing is or does for its caller. Mechanism, type, and implementation
history belong in the body.

- **Intent over mechanism.** `parseRow` over `procData`. The caller cares what it gets
  rather than how the bytes are walked.
- **Intent over type.** `deadline` over `timeInt`, `user` over `userObj`. The type is
  already in the signature, so repeating it in the name spends the one place you had to
  say something new.
- **Length tracks scope.** A loop index is `i`, and a module-level binding is not `d`. The
  cost of a short name is paid by whoever must hold it in their head, and that cost scales
  with how far it travels.
- **Booleans read as true assertions.** `is_ready`, `has_parent`, or `should_retry`,
  rather than `flag`, `status`, or `check`. Negated names (`not_ready`, `disable_x`)
  double their cost at every `!` in front of them.
- **Effects are verbs; values are nouns.** A name that hides a side effect is the
  expensive kind of wrong, because it survives review. A reader who trusts `getUser` not
  to write will not check.
- **One concept, one word, everywhere.** If `user`, `account`, and `principal` are the
  same thing, two of them are costing every reader a lookup and every search a miss.
  Conversely, one word for two concepts is worse.
- **Units and frames go in the name where a wrong one is possible.** `timeout_ms`,
  `path_abs`, `size_bytes`. This rule has an incident behind it in most codebases that
  skipped it. Put the unit before the qualifier (`latency_ms_max` rather than
  `max_latency_ms`) so that `latency_ms_min` sorts and greps beside it instead of across
  the file.

## Axis 2: Shape

This axis is how functions, types, and control flow are formed. The question is always
whether this can do the same job with fewer moving parts.

- **One job, one level of abstraction.** A function that both orchestrates and fiddles
  with bytes has two readers to serve and serves neither. Mixed levels are the signal that
  an extraction is available.
- **A boolean parameter means two functions.** `render(x, true)` is unreadable at the call
  site and the body is an `if` at the top. Split it.
- **Make illegal states unrepresentable.** Where the language allows a sum type, enum, or
  newtype, encoding the invariant in the type removes every downstream check and every
  place one was forgotten. This is the single highest-leverage structural move available
  in most languages.
- **Parse at the boundary, don't validate everywhere.** Convert unstructured input to a
  structured type once, at the edge, so interior code cannot be handed something invalid.
  Repeated defensive checks in the interior are the symptom that this was skipped.
- **Early return over nesting.** Depth is a usable proxy, so past three levels, ask what
  guard clause is missing.
- **Data threaded through layers that do not use it** is a seam in the wrong place. Follow
  the parameter, and if three frames only pass it along, the boundary wants moving.
- **Duplication is cheaper than a wrong abstraction.** Two occurrences are not a pattern.
  Extract on the third, and only when they are the same *reason* rather than the same
  *shape*, since shape-matched extractions are how unrelated code ends up coupled.
- **Dead code, unused parameters, and speculative generality are deletions.** An
  abstraction with one implementation and no second caller in sight is costing indirection
  for a future that may not arrive.

## Axis 3: Data

Data-oriented design: decide the layout from what the code actually does to the data, at
the volume it actually does it.

**This axis is evidence-gated.** A finding here requires one of: a profiled or plain per
item hot path, a performance budget, or a measured regression. Absent that evidence the
axis stays silent, because layout critique on a config loader or a startup path is noise
and, worse, trades legibility for nothing. Be explicit. The gate is accuracy, we don't
want to spend legibility to buy a regression.

- **Design for the transformation, not the noun.** Ask what the loop does to a million of
  these rather than what one of them "is." Most object modeling errors are the noun
  question answered first.
- **Layout follows access pattern.** Fields touched together belong together.
  Array-of-structs versus struct-of-arrays is decided by which fields the hot loop reads.
  Pulling a 200-byte struct through cache to read one `u32` is the canonical waste.
- **Know the struct's real size.** Field ordering to remove padding is free and invisible
  to callers. If nobody has printed `@sizeOf`/`size_of`, nobody knows.
- **Solve for many.** Zero, one, and many are the counts that exist, and a data path built
  for one grows a loop later and keeps the one-shaped API.
- **Allocation inside a loop is the first thing to look for.** Hoist, reuse a buffer, or
  use an arena scoped to the batch.
- **Handles and indices over pointers** where a collection owns its elements. They are
  stable across growth, smaller, and serializable, and they make ownership explicit rather
  than implied by a raw address.
- **A branch inside a hot loop invites partitioning the data instead.** Sorting or
  bucketing once beats branching per item.

Speed is only part of the honest claim for this axis. Deciding the transformation first
tends to produce *simpler* code (fewer intermediate objects, flatter call trees), which is
why it sits in a structural standard rather than a performance one. Where it genuinely
trades legibility for throughput, that trade is stated in the finding and is the owner's
call.

## Axis 4: Ownership

Which module owns which data, and what crosses a boundary.

- **Every mutable thing has exactly one owner.** Others read a view or ask the owner to
  change it. Two modules writing the same state is the bug that arrives later, under
  concurrency or under a refactor.
- **Dependency direction is stated and acyclic.** A cycle means a boundary is drawn in the
  wrong place, and the fix is moving the shared concept rather than adding an interface to
  break the cycle.
- **A module's public surface is the smallest set that lets callers work.** Everything
  else is internal. Surface is a promise, and an accidental promise is the expensive kind.
- **Types that cross a boundary are the contract.** Leaking an internal representation
  across a seam means it can no longer change, because the type is now load-bearing for
  code you cannot see from here.
- **No `utils`, `common`, or `shared` catch-all.** A module everyone depends on and nobody
  owns has no invariants, accumulates unrelated code, and becomes the cycle nobody can
  break. Name what it actually is, or push each piece to the module that owns its data.
- **Lifetime travels with ownership.** Whoever allocates decides who frees, and it is
  written down at the boundary, in a doc comment, a type, or a name.
- **Global mutable state has no owner by construction**, which is the whole finding.

## Axis 5: Legibility

The walkthrough question: can a competent stranger start at the entry point and reach any
feature's implementation in a few hops, following references rather than searching?

The test is run rather than imagined. Pick a real feature, trace it from entry to exit,
and record two things: the number of hops, and every moment you had to search rather than
follow. Searches are the finding, since each one is a place where the structure did not
carry the reader.

- **One obvious starting point.** `main`, a README section, or a doc that says where to
  begin. Its absence costs every new reader the same twenty minutes.
- **The file tree mirrors the concept map.** A directory listing should teach the domain.
  Directories named after layers (`models`, `handlers`, `services`) teach the framework
  instead, and scatter each feature across all of them.
- **Comments carry why; names and structure carry what.** A comment restating the code is
  a maintenance liability that will eventually contradict it. A comment explaining a
  non-obvious decision is often the highest-value line in a file.
- **The happy path is readable end to end** without stepping into error handling. Where
  error handling dominates the trunk, the shape wants inverting.
- **Surprise is a finding.** Record anything that behaves other than its name and location
  suggest, since that is exactly what the stranger cannot predict.

## Axis 6: Assertions

An assertion states an invariant the code depends on, at the place it must hold. It
belongs in a structural standard rather than a correctness one because its first audience
is the reader. An asserted invariant is the only form of documentation that cannot drift
from the code, and a function with its preconditions asserted tells a stranger what it
assumes without being read through.

- **Assert the negative space, not just the positive.** Assert what you expect AND what
  you do not. The second catches the case the first was written around, which is where the
  surprise lives.
- **Pair assertions across independent paths.** The same property asserted from two
  directions catches the bug that satisfies one of them. A single assertion next to the
  code that establishes it mostly restates that code.
- **One property per assert.** `assert(a and b)` loses which half failed, and failure
  locality is most of an assertion's value.
- **Assert what this process established; branch on what crossed a boundary.** Anything
  from storage, a wire, a subprocess, or a user is an input, and gets an error path with a
  taxonomy rather than an assertion. Reserve assertions for invariants that the current
  process itself created.

There is no density quota. The practices above carry the value, and a count would only
invite gaming.
