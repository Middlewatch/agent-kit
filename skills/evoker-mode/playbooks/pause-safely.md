### Pause safely

**You own a clean stop that a cold-start agent can resume from.** For
"pause here", "I need to stop", "pick this up tomorrow", or when the session
is near its context limit with work in flight. This is explicit or
structural only: "keep going" and "going to bed, finish it" mean continue.

1. Stop at a safe boundary. Finish the current atomic step or back it out.
   Start nothing new. Wait out or abandon outstanding delegations.
2. Cross no owner gate to pause. No publishing, no pushes beyond what
   already exists, nothing from the destructive list.
3. Make the work durable. Commit uncommitted edits as one `wip:` commit on
   the current branch. If the tree is broken, say so in one line in the
   commit body.
4. Bring the trail current per `guidance/trail-standard.md`: append rows for
   any decisions made since the last row, and check that every evidence cell
   resolves.
5. Write `RESUME.md` at the worktree root: the goal, where the work stands,
   what is verified versus assumed, the next two or three actions, key file
   paths, and gotchas. Point at `trail.tsv` for decision history instead of
   restating it.

**Reply:** where you stopped and why it is a safe boundary, the commits
made and whether the tree is clean, what lives in `RESUME.md` versus what
was only in your head, and the first action on resume.
