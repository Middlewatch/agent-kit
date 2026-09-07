# Yazi trial: retention review

Status: all four recommendations adopted by the owner on 2026-09-07. Reviewed 2026-09-07 by an independent fresh-context reviewer against the original skill and the user/assistant transcript from session `01a07d4c-4907-75be-b3c8-d0d1805147e7`. The root checked each quoted observation against the transcript. The [Yazi tutorial](tutorials/yazi/TUTORIAL.md) preserves the exercises and outcomes.

The trial adapted to reported navigation difficulty, reduced hints, and ended with a goal-only challenge. The learner reported no lookup on that challenge, and file checks verified its outcome. This establishes immediate task completion; delayed retention was not measured. The cause of the earlier copy/move mismatch was not observed.

## S1: Offer smaller hints after a recall attempt

Evidence: the learner said, "ultimately these are all new motions for me so repetition on which keys are up and down vs left and right is what im working on the most". The response supplied a map, then a later route with fewer cues.

Adopted instruction: When revisiting a practiced action, offer a goal before reminding the learner of its keys. If the learner requests help or reports an error, give the smallest useful cue and expand it as needed. Honor an explicit request for the map.

Trial exercise: after confirming the starting folder, ask for a route through familiar folders without a key recipe. If the learner gets stuck, ask which direction they need before supplying that key.

## S2: Revisit older skills after intervening work

Evidence: the reduced-prompt navigation task asked for recall before consulting the map. Navigation recall was checked within the same teaching block.

Adopted instruction: Revisit an earlier skill during a later task or on resume, before a recap, and use reported difficulty to decide whether a reminder is useful. Treat spacing as a candidate technique to test rather than imposing a fixed exercise interval.

Trial exercise: at the next session, confirm the visible starting state, then ask the learner to reach `handoff`, preview `supplies.txt`, and return. Record any lookup or prompting before choosing new material.

## S3: Predict and verify both sides of a copy or move

Evidence: the later correction identified source copies that the initial destination check had missed.

Adopted instruction: For confusable operations, ask the learner to predict the distinguishing outcome and verify it. For a copy or move, inspect both source and destination before advancing.

Trial exercise: use two disposable files and an empty destination. Ask the learner to copy one and move the other, predict which source should remain, then check both source files and both destination files.

## S4: Mix goals that require different lookup operations

Evidence: the walkthrough explained, "Lowercase `s` searches filenames using `fd`; uppercase `S` searches file contents using `ripgrep`." Guided searches confirmed those operations individually; a mixed choice exercise was not assigned.

Adopted instruction: Present a familiar lookup goal without naming its command, ask the learner to choose the operation, and check its result. Use their choice to locate confusion between similar operations.

Trial exercise: ask for a current-folder name lookup, a recursive filename search, and a content search in a different order from the original lesson. Supply one goal at a time, with no key recipe.

## Adoption boundary

The owner adopted these recommendations after reviewing the trial. The procedure now includes recall before reminders, later retrieval, contrasting outcome checks, and mixed operation-choice tasks. Adoption is a teaching choice, not evidence of a general retention effect; later sessions should still record prompting and delayed recall separately from immediate completion.
