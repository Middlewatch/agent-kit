---
name: circuits
description: "Grill the owner into circuit specs: recurring work and life processes captured precisely enough to delegate. Use when the owner invokes /circuits with a circuit to design, or with nothing, to go find one. Not for project or feature specs (use spec)."
disable-model-invocation: true
---

# Circuits: spec the recurring parts of a life

Run a grilling session whose only output is circuit specs in the circuits workspace.
The rounds discipline comes from `~/.agents/skills/spec/SKILL.md`: read it before the
first round and follow its step 2. Everything else about that skill (its template, its
`docs/specs` path, its slices) is replaced by the contract below.

## The circuit lens

A **circuit** is a recurring pattern in the owner's life: a career, a week, a morning,
one repeated activity. A life is circuits within circuits. Seeing it that way reveals
how predictable its activities really are, and predictable means delegable. Use the
lens to find circuits worth specifying. Propose ones the owner has not noticed.

## Vocabulary

Shared language, reached for only when a circuit calls for it, never a checklist.
Mandate nothing structural: a circuit needs no AI, no checkpoint, and no schedule unless
the grilling shows it does.

- **Trigger**: what fires each run, either an **event** (a new email, a new RFI) or a
  **schedule** (every morning). Event triggers are usually the more efficient.
- **Checkpoint**: a human-in-the-loop point where the owner verifies or decides. Some
  circuits have none and run autonomously; some use no AI at all.
- **Push right**: defer the checkpoint as far as it will go. Do maximal work before
  involving the owner, so they are asked once, late, with everything prepared.
- **Brief**: what a checkpoint presents: a tight, decision-ready summary (what was
  produced, why, and a link down to the asset itself), never the raw output. The owner
  reads a brief, not a draft. Speed of review is imperative.

## The workspace

`~/.agents/projects/circuits/` is the only place this skill writes.

- `*.md` at the repo root: one spec per circuit, kebab-case slug. Group into
  subdirectories (`work/`, `life/`) only when volume demands it.
- `CONTEXT.md`: canonical terms, maintained under the `glossary` skill's discipline.
  Record a term the moment the grilling settles it.
- `NOTES.md`: raw notes on the owner's world, the tools they use, the channels they
  process, and their own terminology for both. When it is empty or thin, interview the
  owner about their world before specifying anything, and sharpen fuzzy terms into
  CONTEXT.md entries as they surface.

Scratch and transcripts go to `$PI_SCRATCHPAD`.

## Procedure

1. **Read the workspace.** `CONTEXT.md`, `NOTES.md`, and the existing specs. When the
   owner named a circuit, start there. When they gave nothing, apply the lens to what
   the notes and the conversation reveal, and propose candidates.

2. **Grill in rounds** per the spec skill's discipline, aimed at one question: what
   would an implementer need to run this circuit without asking anything? Create, edit,
   and delete specs as rounds resolve things.

3. **Put it to the owner.** The spec paths plus the choices that carry consequences.

## Definition of done

A circuit spec is done when an implementer agent could build it without asking a single
question. Nothing is done while a question remains. Whatever shape a spec takes, it
answers four things: what fires a run, what happens, where the owner sits (if
anywhere), and what a finished run looks like.
