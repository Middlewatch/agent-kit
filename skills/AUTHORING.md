# Authoring agent skills

## Guideline and Disclaimer

This guide is intended to be shared between human and LLM authors, Please note that you
should never let an LLM be the sole owner of an authored skill, you cannot prompt your way
to an effective skill. These files require a human in the loop writing the rough draft and
doing the final editing. Skills should be iterated on and refined over time to fit your
own workflows, never wholesale adopt a skill that was authored by someone else without
first identifying how you will be using it.

## What is a skill

A skill is an invocable procedure or a resuable prompt. It's pretty straightforward
actually, treat skill files as prompts + you sometimes give a model the ability to
discover and use them automatically based on pre-defined trigger based judgement calls on
their part. I have considered numerous ways to structure skills and have came to the
conclusion that there is no deterministic "best" way to write a skill just like there is
no deterministic "best" way to write a prompt. Your goal when writing a skill is to nudge
models behavior towards an intended outcome and to do your best to define what that
outcome is. To a certain degree you (the human in the loop) has to understand what your
models are capable of understanding and how you best work with them.

## Where instructions live

This is roughly how I structure my instruction set, there is absolutely no best way to do
this, I recommend just building a system that works for you personally and helps you keep
track of where info lives.

- **Playbook:** policy shared by several workflows.
- **`SKILL.md`:** trigger, boundaries, outcome, procedure, decision branches, output
  contract, and verification.
- **`references/` `guidance/` `docs/`:** rationale, evidence, full templates, examples,
  compatibility notes, and tool- or version-specific runbooks. Exists to preserve the
  decision making process and audit yourself down the road
- **`scripts/` `tools/`:** behavior that can be enforced mechanically. If you can take a
  "rule" and check it with code set it up yourself or ask your agent to clank one up for
  you. Highly valuable when used effectively but be careful with overusing them.

When a skill is built on a playbook, a reference, or a settled owner preference, state what
the skill does with that authority and link to the source. The skill does not need to
reproduce or reinterpret the authoritative source if it already exists and is readable.

## Shape `SKILL.md`

Use this order as a rough guidline, handwritten and targeted skills are most effective but
this scaffolding can help ensure you cover what you need to when drafting.

1. **Frontmatter**: `name` and a quoted `description`. Describe the action briefly and the
   invocation cues, you do not need to explain the skill in the description, all the
   system prompt needs to show is when the skill is to be used. Trigger cues live only in
   the description; the body starts at execution.
2. **Goal**: one or two sentences stating what capability the skill provides. This
   frontloads the model weights and is valuable for steering behavior
3. **Outcome and boundaries**: the artifact or changed state that constitutes success,
   plus what the skill does not do (within reason, normally what the skill does not do is
   self explanatory, but if you notice misinterpretations often enough it is worth adding
   a hard boundary.)
4. **Preconditions**: required inputs, and conditions that should stop or redirect the
   run.
5. **Procedure**: a small number of ordered stages. Specify dependencies between stages,
   and leave implementation choices open where order does not affect the outcome.
6. **Decisions, Examples, and Blockers**: owner gates, positive and negative examples,
   blocked outcomes, unavailable tools, insufficient evidence, safe substitutes, and
   justified deviations from defaults. Only include as applicable.
7. **Output and verification**: required fields or files, runnable gates, and the evidence
   reported at completion. (Be careful with these, agents will overprescribe and will
   overenforce strict verification rules. Only include these if you truly want
   verification to run every single time you invoke this procedure)

Agents will rarely read linked references unless specifically directed. If you are
bringing in a reference document as guidance or prescription into your skill or, if you
are linking multiple skills together as a nested procedure you need to be clear on how and
why these references should be read and when the next step should be ran.

## Choose the right degree of rigidity

Use an unconditional imperative (DO NOT, NEVER, etc.) when it protects safety, evidence
integrity, interoperability, an owner decision, or a recurring demonstrated failure. Make
the enforcement or reason visible. Often, overly prescriptive imperatives lead to edge
cases that run counter to the intended outcome.

Call a method a default when another method can satisfy the same procedure, this will help
you and the agent understand why to choose this one over that one. Examples include
research breadth, delegation, tool choice, concurrency, internal notes, file-reading
strategy, and the size of a review panel.

Present optional techniques as options rather than disguised requirements. Require the
procedure that controls the risk rather than an absolute quality promise such as "zero
false positives". Numeric thresholds should be meaningful or avoided, otherwise you may
find yourself over linting and over testing rather than simply writing code.

Exact schemas, paths, and section names are appropriate when another tool or skill
consumes them. Be careful when you create a dependency on a tool that may or may not exist
in your environment in the future.

## Seed and maintain references

References are the skill's growing evidence base. Add useful information during real work
instead of waiting for a rewrite:

1. Update an existing topic before creating a sibling document.
2. Record the claim or technique, where it applies, the evidence or reproducer, provenance
   and date, and any version or environment boundary.
3. Mark empirical material `candidate`, `verified`, or `retired` when its trust state
   matters. Keep candidate material out of mandatory skill instructions.
4. Link the reference from the decision point it informs.
5. Promote a finding into `SKILL.md` only when it changes the procedure and opposes a
   likely agent default. Move shared doctrine into a charter and mechanically checkable
   behavior into a script.
6. Amend or retire stale guidance when tools, APIs, or project conventions move, and
   preserve the evidence that explains why.

For an empirical reference entry, this compact shape is usually enough, try not to
overcomplicate your life:

```markdown
## <claim or technique>

- **Status:** candidate | verified | retired
- **Applies to:** <scope, versions, environment>
- **Evidence:** <reproducer, measurement, artifact, or source>
- **Provenance:** <path or URL, date>
- **Consequence:** <what an agent should do differently>
```

You can let your agents do this, but be careful, they will create barriers for themselves
accidentally due to a one off issue or a frustration encountered on a project. Lessons
learned are valuable but enforcing that same lesson where it no longer applies is actively
harmful.

## The ledger

Each skill carries a `LEDGER.md` from its first revision on: dated entries pairing each
revision's motivation with its later observed outcome. When a session changes what a
skill makes an agent do, it appends an entry at edit time, creating the file if absent; the introspect sweep
(`~/.agents/kit/docs/specs/2026-09-01-introspect.md`) adds outcome lines once there is
evidence and reads the ledger before proposing the next revision. Typo fixes,
formatting, and bulk migrations do not get entries.

```markdown
## YYYY-MM-DD — short title
- Motivation: why this change, with evidence pointers (episode IDs, friction
  notes, touch counts) where they exist
- Change: what changed, one or two lines
- Outcome (YYYY-MM-DD sweep): appended later by the sweep
```

A cautionary precedent: the deep-research run ledger was retired in August 2026 because
it had a writer but no reader (one journal mention in two weeks). These ledgers earn
their place only while the sweep reads them; if the sweeps stop, retire the ledgers
rather than letting the ritual run on.

## Verify a skill before deployment

Use them, literally, just open a chat and use them. Thats all there is to it.
