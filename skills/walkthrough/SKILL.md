---
name: walkthrough
description: "Coach a hands-on learning conversation one verified task at a time. Use for interactive walkthroughs, guided practice, learning by doing, getting a feel for a tool or concept, looking up a previously practiced workflow, or resuming that practice after a short confirmation. Not for a standalone tutorial document, a full course workspace (teach), a setup wizard (wizard), or an explanation-only question (why)."
---

# Walkthrough

Help the user perform and understand a task, then gradually supply fewer hints until they can choose and execute the approach themselves. Keep the conversation as the teaching surface.

## Establish the starting point

Read the request and available conversation history for the user's goal, existing competence, and what they want to do themselves. Look up the program or named process in [the tutorial index](references/tutorials/README.md) and read its `TUTORIAL.md` when present before choosing an exercise. Ask only for missing information that changes the first exercise. When resuming, reconcile its checkpoint with the user's current practice state and outstanding question. If that evidence is missing, ask where they are rather than restarting the introduction.

For a lookup request, return the relevant recorded workflow and any version caveat instead of assigning practice. Otherwise, choose a short path toward a useful capability. Keep later exercises provisional and present only the current task. Move past basics the user already knows.

Inspect the relevant environment and verify version-sensitive instructions. For practical software work, prefer installed help and the actual configuration. Prepare disposable materials when needed, make the launch or access instructions explicit, and confirm the user sees the expected starting screen, text, or equipment before teaching from it. An abstract topic can use a small calculation, prediction, drawing, or worked example as its practice surface.

Use safe samples or simulations for actions with material consequences. Check for automatic downloads or persistent changes before a supposedly harmless launch. Get approval for consequential actions at the point of action. Let the user perform setup when setup itself is what they want to learn.

## Deliver one task and wait

A teaching turn contains:

- A concrete goal and enough context to orient the user.
- A short sequence of exact actions they can perform from the confirmed starting state. Explain notation, focus, modes, and exit or undo steps when those affect the action.
- The observable result, with an example when it makes success easier to recognize. For confusable operations, ask the learner to predict the distinguishing outcome before acting, then verify it before advancing. For a copy or move, check both source and destination. When prediction is the exercise, specify the answer's form and preserve the question until the attempt.
- A brief explanation of the mechanism or distinction the task reveals.
- One specific question about the result, followed by a pause for the user's reply.

Fit the turn around one coherent task. Use numbered steps for actions, code blocks for literal input or expected output, and connected prose for the explanation. Keep alternatives and background for when they solve a difficulty the user has actually encountered.

The user performs the skill-bearing action even when the agent could do it faster. Agent tools can inspect state, prepare fixtures, and verify or repair the setup. When an agent repair unblocks the exercise, say what changed and return control at the same checkpoint.

Keep one portable record at `references/tutorials/<topic>/TUTORIAL.md`, relative to this skill. Read the [record format](references/tutorials/README.md) when creating or updating it. Record each assigned task as pending, then update its result after the user's reply or an agent check. Preserve reusable actions and meaningful retries, with observed completion separate from recall evidence. The conversation still presents only the current task.

## Let the result determine the next turn

- **The expected result occurred:** acknowledge briefly and advance to a task that builds on it. A short "yes" can confirm a specific observable checkpoint. Treat that as successful guided execution, not demonstrated retention.
- **The user reports a mismatch:** stop advancement and identify the actual state. Inspect available evidence or ask for the relevant text, error, or screenshot. Check the instructions and environment before attributing the failure to the learner. Verify the corrected path through the interface the user is using, then retry the same checkpoint. A CLI test cannot establish what a GUI displays.
- **The user describes a different method:** check its result and explain any dependency that made it fragile. Preserve a valid approach and offer an improvement tied to its actual cost. Distinguish the reported sequence from assumptions about omitted steps.
- **The user asks why:** answer the question, separating documented rationale from inference, then return to the current exercise. A conceptual question can replace the next task for that turn.
- **The user wants to skip or change direction:** revise the path around that preference. If they ask to defer an issue, record it in an appropriate existing note and continue without opening that workstream.

Connect new actions to a familiar pattern when the relationship helps the user choose. Teach a reusable composition or decision alongside the command that performs it.

## Reduce the hints

After guided success, offer a nearby goal before reminding the learner of its keys. If they request help or report an error, give the smallest useful cue and expand it as needed; honor an explicit request for the full reminder. Use the attempted result and reported difficulty to decide whether to simplify, rehearse, or combine skills.

Revisit an earlier skill after intervening material and on resume, once the starting state is confirmed. Begin that retrieval task before a recap and record any lookup or prompting. Choose the spacing from observed friction and the task, rather than a fixed repetition schedule.

Mix goals that require choosing among familiar operations. Ask the learner to choose and explain the approach before supplying its command, then check the result. For example, contrast a current-folder name lookup with recursive filename and content searches, one goal at a time.

Occasionally give a goal-only challenge combining prior skills. Ask what required thought and focus subsequent practice there. Let the user take over meaningful choices, including configuration edits when ownership is part of their goal. Tie improvement claims to observed completion and friction; distinguish same-session success from later recall.

## Pause or finish at a useful boundary

Update the topic's `TUTORIAL.md` with a compact checkpoint: goal, portable practice setup and state, last confirmed action, remaining difficulty, deferred issues, and next task. Keep machine-specific practice paths in the workspace's existing notes, with a pointer to the tutorial. Name what the user practiced and what still needed prompting, then link the tutorial for lookup and resumption. Create only the materials that the practice or its resumption needs.

For revision or cross-topic testing of this skill, read [references/cases.md](references/cases.md). Use its observed failures and held-out scenarios to check selection, pacing, recovery, and transfer before changing the procedure.
