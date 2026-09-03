### Authoring a skill

**You own a skill that triggers and reads right.** For writing or editing a
SKILL.md, a playbook, or a principle file.

1. Read `~/.agents/skills/AUTHORING.md` first; for a playbook, also
   `guidance/playbook-standard.md` and `playbooks/TEMPLATE.md`.
2. Put every invocation cue in the description; harnesses select on it, not
   the body. The body states desired actions, each stated once.
3. Keep prohibitions only where a code gate enforces them; elsewhere say what
   to produce instead.
4. Verify: `slopcheck` the prose, then trigger-test in a fresh session on a
   real task and watch whether it fires and which steps get skipped.
5. A step skipped with the same reason twice is deleted or rewritten so it
   fires (playbook-standard's verification rule).
6. The owner's edit pass makes it adopted; stage uncommitted until then.

**Reply:** the path, the trigger phrases, what the fresh-session test showed.
