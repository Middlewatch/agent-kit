# Walkthrough evidence and test cases

Use this file when revising the skill or testing whether it transfers to another topic. The historical observations explain the current procedure. The scenarios below test behavior in a fresh context; they are not claims about a new learner's results.

## Observations from the source walkthroughs

Reviewed on 2026-09-07. These are observations from one owner's Dolphin and Neovim conversations, not a measured comparison of teaching methods. Episode IDs refer to the estate's journal recall system. The [tutorial index](tutorials/README.md) links the reusable records and redacted source dialogue.

| Observation | Evidence | Consequence |
|---|---|---|
| One small task, an expected result, and a question kept the user actively performing the work. | Dolphin copy and move exercises used disposable files and checked their locations. The later ZIP exercise, episode `aj1-522f53e57dfe7ee18ce3e2e1ec4684f2`, used the same prompt structure but was skipped, so it provides no completion evidence. Neovim used the pattern for editing and code tools; the owner requested preserving this style. | Keep the live task as the unit of instruction. |
| A short explanation helped distinguish operations with similar names. | Dolphin staging exercise, episode `aj1-62b262c343496933bbaf3e49fa144ec2`: chezmoi add captures a live file, while Git Add stages its managed source. Neovim similarly contrasted changing quote contents with deleting surrounding quotes. | Explain the distinction beside the action that exposes it. |
| The user's goal was deeper understanding through doing the integration themselves. | Episode `aj1-0d39a47ea57c506d5870803982ec026b`: the owner chose a Dolphin/chezmoi integration as a way to learn chezmoi beyond surface familiarity. | Separate agent preparation from the user's learning action. |
| The curriculum drifted toward familiar basics and then dumped a feature list. | Episode `aj1-a2a0e6925dbbe4995322116d9f7a0fe6`: the owner asked to stop basic file actions and explore Dolphin-specific capabilities. The reply listed several features before assigning one task. | Calibrate to existing competence and keep the rest of the path provisional. |
| Successful checks at one layer missed a mismatch at another. | Episode `aj1-c5571dee892d4d4256b976a3460a643f`: clean Git state coexisted with a chezmoi permissions difference. During the Neovim walkthrough, a headless launch opened the exercise while the Neovide GUI stayed empty. | Match the check to the behavior being taught. |
| The first Neovim lessons assumed an exercise document the user could not see. | Neovim walkthrough: the owner asked whether a starting document was supposed to exist. Live GUI probes reproduced the empty buffer and confirmed a corrected launch order. | Confirm the starting surface before using its contents as teaching targets. |
| Repeating an unfamiliar sequence was fragile when cursor-reset and line-advance movements happened outside the macro recording. | Neovim final challenge: the owner reported using a macro for repeated word replacement. The reply explained the recording boundary and recalled the simpler search-plus-dot technique. | Respond to the method the user actually tried and use errors to select reinforcement. |
| A short confirmation lost its context after a model change. | Episode `aj1-3fc4faaa78667204cceaf1a8eaaf2139`: the owner asked to review the log and resume. The recovered checkpoint was project-content search, followed by buffer switching. | Recover the active checkpoint before interpreting a short reply. |
| Many successful confirmations did not remove the need for practice or configuration ownership. | At the end of the Neovim walkthrough, the owner still reported friction in editing, navigation, and remembering controls, and asked for repeatable drills. | Distinguish guided completion from independent use and gradually reduce the hints. |

## Yazi trial and tutorial records

On 2026-09-07, the owner explicitly invoked the draft in session `01a07d4c-4907-75be-b3c8-d0d1805147e7`. The [Yazi tutorial](tutorials/yazi/TUTORIAL.md) records every assigned exercise and the paused practice state. Its final goal-only challenge succeeded with no lookup reported and agent-verified file outcomes. Earlier destination-only verification missed extra source copies after a requested move; a later two-sided check exposed the mismatch and verified the retry.

The owner requested per-topic tutorial records inside the skill so completed workflows and checkpoints travel with agent-kit. Read the [retention review](retention-review.md) when considering reminder timing or exercise changes; the owner adopted its four recommendations, but their effect on delayed retention remains unmeasured.

Additional behavioral probes for the record change:

| Scenario | Distinguishing check |
|---|---|
| Resume Yazi on another machine with its tutorial available but no practice files. | Recover the checkpoint, check the new environment, and offer fresh disposable setup or an existing practice path before assigning an exercise. |
| A new exercise was assigned, but the user pauses without trying it. | Keep it pending in the tutorial and preserve the prior confirmed result. |
| The user confirms arrival after a move, but source absence has not been checked. | Record only the observed outcome, not a completed move; retain the source check as outstanding. |
| The user asks how to repeat a completed workflow. | Find its recipe in the existing tutorial without adding a duplicate exercise or assuming a full restart. |

## Selection probes

Give a fresh agent the candidate's description and the descriptions of neighboring skills. Ask it to choose a skill or an ordinary answer before it reads the body. Record the choice and rationale.

| Request | Expected route |
|---|---|
| "Can you set up a Neovim walkthrough like the Dolphin one? I want to get a feel for motions and editing." | walkthrough |
| "I want to get beyond surface knowledge of chezmoi by making a useful Dolphin integration myself." | walkthrough |
| "Help me practice interpreting confidence intervals. Give me something to work out and check with you." | walkthrough |
| "Yes." after an active walkthrough's specific checkpoint | Continue walkthrough |
| "Write a standalone tutorial page on SQL joins for our docs." | Document authoring, outside walkthrough |
| "Create a multi-session statistics course workspace with HTML lessons and learning records." | teach |
| "Generate a bash wizard for entering the CI secrets I must set manually." | wizard |
| "Why did Vim choose semicolon to repeat a character find?" without an active lesson | why |

## Behavioral probes

Provide the skill and one scenario to a fresh agent. Request the next user-facing response rather than a critique of the skill. Inspect the response against the distinguishing check. Use separate contexts when one scenario would reveal another's answer.

| Scenario | Distinguishing check |
|---|---|
| New practical topic: the user wants to learn spreadsheet absolute references. A blank disposable sheet is open in LibreOffice Calc. They can enter a formula but have never copied one. | Start one small exercise from the confirmed blank state, supply the needed cell values, name an expected result, and wait. |
| Non-software topic: the user wants to understand how the mean reacts to an outlier. They can compute an average and have paper available. | Give a small calculation or prediction with an observable answer and a reason to compare it, rather than a lecture or a new software workspace. |
| Starting-state failure: the tutorial mentions a word in a practice file, but the user reports an empty editor window. A headless test passed. | Suspend the edit lesson and establish or repair the visible starting state. Keep the GUI result unverified until the user or a live probe confirms it. |
| Fragile method: the user says they reset the cursor before recording and moved to the next line after recording, then replayed twice with mixed results. | Explain what the recording includes, preserve valid choices, and offer a more stable next attempt without claiming to know omitted keystrokes. |
| Resume: the last confirmed task was searching project contents. The user says the model changed and asks to continue. File opening is already familiar, and buffer switching is next. | Recover and confirm the active state, try a brief retrieval task before recap, and keep buffer switching as the next new material rather than restarting orientation. |
| Deferred issue: the user reports success, asks to audit an outdated shortcut reference later, and wants to continue. | Capture the deferred issue and keep the next learning task separate from the audit. |
| Apparent fluency: the user has confirmed several exact sequences but says they still cannot choose commands unaided. | Offer a smaller goal-only or partially hinted task using existing skills, then use the reported difficulty to choose what follows. |
| Retention: the learner resumes a familiar folder-navigation task after a break and the starting state is confirmed. | Give the goal before the key map; supply a small cue after difficulty or a request, and record prompting separately from completion. |
| Confusable operations: the learner must copy one sample and move another into an empty folder. | Ask which source should remain before the attempt; require source and destination evidence before claiming a completed move. |
| Mixed lookup: the learner has practiced current-folder find, recursive filename search, and content search. | Assign one lookup goal without its shortcut and ask them to choose the operation; avoid reciting the whole key list first. |

A response passes when the user can perform the current task, recognize the result, and return with evidence that determines the next turn. Inspect actual generated responses. File discovery and prose lint only test packaging.
