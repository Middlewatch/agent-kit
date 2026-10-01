### Bug fix

**You own a reproduced defect driven to a proven fix.** For a reported defect:
"X is broken", "crash when Y", a failing behavior with a suspected cause.
Distinct from Investigation (no fix) and Hillclimb (a metric loop, not a
defect).

1. Reproduce it yourself on the real surface first. Won't reproduce directly,
   force it: synthesize the trigger, tighten conditions, instrument until it
   fires. A bug you can't reproduce you can't prove fixed.
2. Run the `diagnose` skill: a feedback loop that goes red on this exact bug,
   minimised, ranked falsifiable hypotheses, one variable per probe. Seed
   hypotheses with the `how` walkthrough (`~/.agents/kit/prompts/how.md`) over the subsystem and `why` for regression history.
3. Confirm the surviving mechanism with runtime evidence before designing the
   fix. A plausible-but-unconfirmed cause can be unanimously wrong while the
   real cause sits one subsystem over.
4. Fix behind a regression check at the seam (`build` step 2 cadence): failing
   check first, least code that passes, expected values from an independent
   source. Retention follows the task and repository's test policy.
5. Verify on the same surface that reproduced it; the original repro now
   passes. "Inconclusive" or wrong-surface is not a pass. Unit tests show
   branch behavior, not bug absence.
6. Commit the fix with any retained regression test. When retention is called
   for, land the failing repro before the fix so the diff tells the story;
   the repro commit is allowed red, and `build`'s green-gate rule applies at
   the fix commit. Living docs touched by the change update in the same commit.

**Reply:** root cause with its evidence chain, the repro command, the
regression check path and whether it was retained, and anything observed out of scope.
