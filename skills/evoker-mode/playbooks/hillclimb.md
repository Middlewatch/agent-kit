### Hillclimb

**You own the metric and the experiment's integrity.** For sustained, iterative
improvement of one measurable thing against a target: "make startup 50% faster", "drive
down <metric>", "keep trying until <metric> improves by N%". A one-off fix is Bug fix or
the `diagnose` skill; this is the loop.

Core discipline: one change, one measurement, keep or revert. Never stack untested
changes, never claim a win from code inspection. The data decides (prove-it-works).

1. Ground the workload before choosing the ruler. Run the `how` walkthrough (`~/.agents/kit/prompts/how.md`) over the target, name the
   workload dimensions that can move the result, and pick a case that reproduces the
   complaint. No reproducing case → fix the repro instead of hillclimbing. Fix one metric,
   the better-direction, and a stop predicate pairing a target with a floor on attempts
   ("at least 50% better and at least 10 iterations") so a lucky early win can't end the
   run.
2. Build the measurement harness, prove its sensitivity on contrasting workloads, then
   freeze it (build-the-lever). One repeatable command emits the metric, sampled past the
   noise (median of N). Changing the harness invalidates every earlier number. Record the
   baseline and a green regression gate before any change.
3. Open the trail (`guidance/trail-standard.md`): one row per attempt with hypothesis,
   before, after, and verdict. Read it before each attempt so the search accumulates
   instead of circling. Gitignored so it survives reverts.
4. Ground each hypothesis in the step-1 model so it names a mechanism ("defer X off the
   boot path because it blocks first paint"), not "try memoizing".
5. Loop, one hypothesis per iteration: change, measure before/after with the frozen
   harness, run the gate. Accept only when the metric moves past noise and the gate stays
   green; otherwise revert in full, no "might help" riders. One commit per accepted win,
   staging only the files changed. Log the row either way.
6. Push past the first plateau: pivot category, combine near-misses, re-read the source
   before concluding the hill is climbed. Correctness and simplicity outrank the number;
   revert a win that breaks behavior.
7. Stop when the predicate is met or the remaining ideas are genuinely marginal. Don't
   relax the predicate to declare victory. Stuck → surface it.

**Reply:** baseline, final number, delta against target, the trail path, kept and reverted
attempts, and the harness command a reviewer can rerun.
