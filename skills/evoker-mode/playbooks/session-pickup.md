### Session pickup

**You own the resume point. Read the prior trail instead of redoing it.**
For "pick up where we left off", "take over this branch", "resume <project>",
or a worktree containing a `RESUME.md`. A pickup is inheritance: the prior
agent paid for the reading, the repros, and the decisions, and re-deriving
them burns context and loses their reasoning.

1. Read the inheritance in order: `RESUME.md`, then `trail.tsv`, then
   `git log` and `git diff` against the base. If the note is missing or
   thin, run `memory_search` for the prior session before touching code.
2. Reconstruct operational state: branch, what landed, open todos, decisions
   made. The trail is authoritative input; resist the "let me verify from
   scratch" pass.
3. Diff done against planned and name the resume point in one line.
4. Verify the one or two inherited claims the remaining work builds on
   against the real artifact (run the gate, open the output). A prior
   self-report of success is evidence, not proof.
5. Delete `RESUME.md`. It is a baton, not a record; the trail and the
   commits remain.
6. Route the remaining work to its matching playbook or skill. Pickup ends
   here; the routed workflow owns the rest.

**Reply:** where the prior agent stopped, what you inherited versus redid
(ideally nothing redone), which claims you verified, and the resume point.
