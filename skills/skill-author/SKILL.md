---
name: skill-author
description: "Author or revise agent skills. Use when asked to write a skill, fix unreliable triggering, restructure a bloated body, split supporting files, or fold new guidance into an existing SKILL.md. Not for playbooks, prompt templates, or passive reference docs."
---

# Skill Author

`~/.agents/skills/AUTHORING.md` owns skill doctrine for this estate. Read it before
drafting and defer to it where this procedure is silent.

## Workflow

1. **Ground.** Read the existing skill and every file it tells the agent to read.
   Collect two or three real requests the skill should handle. A skill fits a recurring
   workflow with repeatable steps and load-bearing judgment; passive reference material
   becomes a document instead.

2. **Write the description as the selection contract.** Every invocation cue lives here;
   harnesses select on the description, not the body. Shape: `"[Job or outcome]. Use
   for/when [triggers, artifacts]. Not for [adjacent task]."` Dense fragments beat
   sentences. Keep it denotative even for creative skills, and quote it so YAML
   punctuation (`:`, `#`) cannot change its meaning. Add an exclusion only when a
   neighboring skill or request type could collide.

3. **Write the body starting where execution starts.** The description owns selection,
   so the body carries procedure, decisions, constraints, and observable checks. A
   `Purpose`, `When to use`, or `Triggers` heading means selection content leaked into
   the body: move it into the description and delete the heading. State each action
   once, and keep justification out of the body; a reference file holds the evidence
   when it is worth preserving. Put each critical constraint beside the action it
   governs, phrased as the action to take. Add validation and failure branches only
   where a failed step would cause wrong continuation or side effects. Register matches
   the task: terse imperatives for operational skills, evocative language only where
   tone changes creative output.

4. **Choose the smallest complete structure.** `SKILL.md` alone is the default.
   Procedure needed on every run stays in `SKILL.md`; `references/` holds conditional
   depth and evidence, `scripts/` holds checks that are more reliable as code, `assets/`
   holds templates. When linking a reference, say when to read it and what to do with
   it; agents skip undirected links. Kebab-case the folder, match `name` to it, and keep
   the skill readable without opening another skill.

5. **Trim accumulation, keep judgment.** Remove repeated guidance, generic quality
   reminders, and examples that restate the workflow before touching edge cases, failure
   handling, or hard-won domain rules; those help weaker and context-poor models most.
   Each surviving example teaches a decision or a boundary.

6. **Verify by using it.** Open a fresh session, give it a real task, and watch two
   things: whether it fires, and which steps get skipped. Under-triggering: add concrete
   wording variants of real requests to the description. Over-triggering: narrow the job
   terms and add one exclusion for the colliding neighbor. A step skipped twice for the
   same reason gets deleted or rewritten. Run `slopcheck` on the prose.

7. **Hand off.** When revising an existing skill, append the revision's dated
   motivation → change entry to its `LEDGER.md` per AUTHORING.md's ledger section.
   Leave the draft staged and uncommitted; the owner's edit pass adopts it. Report the
   path, the trigger phrases, and what the fresh-session test showed.

## First-real-case method

For a brand-new skill, solve one hard representative case manually first, then extract
the winning steps into the draft. The real case exposes the true step order and edge
cases; a skill imagined from scratch encodes guesses.
