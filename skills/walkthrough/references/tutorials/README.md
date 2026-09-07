# Walkthrough tutorials

Each program or named process has one `<topic>/TUTORIAL.md` here. Read its checkpoint before resuming; use its completed exercises to look up a workflow.

## Topics

- [Dolphin](dolphin/TUTORIAL.md): file navigation, Git and chezmoi integration, and a deferred appearance experiment.
- [Neovim](neovim/TUTORIAL.md): modal editing, configured navigation, language tools, and the pending configuration-ownership task.
- [Yazi](yazi/TUTORIAL.md): terminal file navigation, organization, search, and editor handoff.

## Record format

When creating a record, use a stable kebab-case topic name and add it to the index. Update the existing topic on later visits.

A `TUTORIAL.md` contains:

- **Checkpoint:** active, paused, or complete; last updated date; learning goal; last confirmed task; difficulty or prompting still reported; deferred issues; next proposed task.
- **Setup:** relevant version and configuration, disposable starting materials, launch instructions, and the expected starting view. Distinguish a fresh replay from an existing practice workspace.
- **Exercises:** one numbered entry per assigned task, in teaching order. Give the goal, starting state, exact actions or a link to an already recorded recipe, expected result, and observed outcome. Record goal-only challenges as goals with checks, so they remain usable for recall practice.
- **Practice state:** the last verified files or equivalent work product, and any unverified interface state needed for resumption.

Create the task entry when assigning it and mark it pending until a response arrives. Record whether completion was user-confirmed or agent-checked, and whether instructions, hints, or lookups were used when known. A successful file check establishes an outcome; the learner's report establishes whether they needed a lookup. Leave delayed retention unmeasured until a later attempt provides evidence.

Keep corrections beside the affected exercise and retain a separate entry for a retry assigned later. Separate assigned-but-unfinished tasks from proposed future work. Reuse existing recipes rather than appending the same instructions for every rehearsal.

Use portable paths such as `$PRACTICE`, sample data, and session or journal IDs for provenance. Keep machine paths and private source material in local workspace notes. On another machine, verify the installed version, bindings, and practice state before treating the checkpoint as the current screen.

When importing a past walkthrough at the owner's request, place its redacted user/assistant dialogue in the topic's `SESSION.md` and link it from the tutorial. State extraction boundaries and substitutions, preserve failed attempts and later corrections, and mark the transcript as historical evidence. Exclude tool payloads, private reasoning, credentials, identifying paths, and image contents from the portable export. Retain raw logs locally under the harness's existing storage.

These Markdown records travel in the skill's Git tree. Practice files and live application state remain local. A record update does not itself authorize committing, publishing, or deploying the skill.
