---
description: Grill one recurring burden into a circuit spec a tool, automation, or agent could take over
argument-hint: "[burden in your own words]"
---
Help me unwind a recurring burden by specifying it as a circuit: a recurring
pattern in my work or life, written precisely enough that a script, an agent, or
a checklist could run it without asking me anything. The burden, in my words:
${@:-nothing named; run discovery}

## Levers

Defaults apply unless I change them here. Any lever still reading `ask` is
round-one material.

- Domain: ask (work | life)
- Frequency: ask (daily | weekly | monthly | irregular)
- Trigger: ask (event, such as a new email or RFI | schedule, such as every morning)
- My seat: ask (none, runs autonomously | one late checkpoint | in the loop throughout)
- Cost of a wrong or late run: ask (trivial | annoying | expensive)
- Implementer: ask (script | agent | checklist | undecided)
- Depth: full spec (or `triage only`: stop after the burden card and your verdict)

## Workspace

`~/.agents/projects/circuits/` is the only place this session writes. One `*.md`
per circuit at the repo root, kebab-case slug. `CONTEXT.md` holds canonical terms
under the `glossary` skill's discipline; record a term the moment a round settles
it. `NOTES.md` holds raw notes on my world: tools, channels, and my own names for
both. Scratch goes to `$PI_SCRATCHPAD`.

## Procedure

1. **Read the workspace.** `CONTEXT.md`, `NOTES.md`, and the existing specs. When
   `NOTES.md` is thin, interview me about my world before anything else and
   write what you learn there.

2. **Name the burden.** Before proposing any structure, get from me in chat prose:
   what I do today, step by step; how often; what a run costs me (minutes,
   attention, dread); what breaks when it is done wrong or late; and which part
   I want to never think about again. Write this up as the burden card and read
   it back. When nothing was named, apply the circuit lens to `NOTES.md` and the
   conversation (a career, a week, a morning, one repeated activity are all
   circuits) and propose two to four candidates, each with a sketched card, and
   let me pick.

3. **Qualify.** Say whether the burden is worth a spec: it recurs, its steps are
   predictable enough to write down, and the cost of the manual runs exceeds the
   cost of setting up a replacement. When it is not, say so and stop; a burden
   that fails here is still worth a line in `NOTES.md`.

4. **Grill in rounds.** Map the open decisions as a tree. The frontier is every
   question whose prerequisites are settled; ask the whole frontier in one
   `ask_user_question` call per round, then recompute. Open-ended questions
   (naming, "what does a good run actually produce?") go in chat prose. Push the
   checkpoint right: do the maximal work before involving me, so I am asked once,
   late, with everything prepared, and asked through a brief (what was produced,
   why, a link to the asset) rather than the raw output. Mandate no AI, no
   checkpoint, and no schedule the rounds did not surface. Write the spec once the
   burden card is confirmed and revise it as rounds resolve things. Stop when the
   four questions in the spec shape are answered and nothing material is assumed.

5. **Hand off.** Give me the spec path, the two or three choices that carry
   consequences, and the next concrete step: what builds this (a script in which
   repo, an agent under which skill, a checklist where) and who does it. Record
   that step under the spec's Implementation heading.

## Spec shape

```markdown
# <circuit name>

## Burden card
What happens today, frequency, cost per run, cost of a wrong run, the part I want gone.

## Trigger
What fires a run.

## Run
What happens, step by step, with inputs, tools, and outputs named.

## My seat
Where I verify or decide, if anywhere, and what the brief at that point contains.

## Done
What a finished run looks like and where its output lives.

## Implementation
Next step, or the path where the implementation lives once one exists.
```
