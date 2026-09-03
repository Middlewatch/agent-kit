---
name: slopfix
description: "Rewrite living documents to the house prose standard without changing any fact. Use when the owner asks for a slopfix, a prose pass, a voice pass, or to bring docs (or responses) in line with the prose standard."
---

# Slopfix: the prose editing pass

Bring documents in line with the prose standard at `references/prose-standard.md`.
`slopcheck` scores the standard's mechanical half. The standard's drafting judgment
rules, its three tests, and the rewrite rules below carry the judgment half. On a
mechanically clean estate the tool usually finds only em dashes, so expect most edits to
come from judgment.

## Outcome and boundaries

Success is a target document, rewritten in place, that passes `slopcheck` (remaining
flags explained), reads better under the three tests, and claims exactly what it claimed
before. The pass edits living documents only. Append-only ledgers (changelogs, execution
logs, journal entries) and creative or personal writing stay untouched, and no fact
moves: every number, name, claim, hedge, and modality survives the pass. A doc carrying
build scaffolding or stale claims goes through `as-built` first, since this pass works on
expression alone. Where a register is intentional (a README with a deliberate personal
voice, a mission statement whose drama is earned), preserve it.

## Procedure

1. **Select.** Take the owner's named targets, or rank candidates with a `slopcheck`
   sweep over the corpus.
2. **Rewrite.** Read the whole document, then apply the drafting rules, the three tests,
   and the rewrite rules below directly. Enumerate candidates from the prose as well as
   from the flags. Clause-joining colons and semicolons, trailing negated contrasts,
   elided verbs, and inline enumerations are all candidates even when `slopcheck` is
   silent. The standard's over-application guard still governs: established dependency,
   earned density, and stated stakes are already correct.
3. **Gate.** Run `slopcheck` on each edited target and explain any remaining flag.
   Re-read against the three tests. Then fact-walk the diff: every number, name, claim,
   and hedge must match on both sides.
4. **Report.** Say what was edited, and name any content cut or relocation candidate
   routed to the owner (see the content rules).

## Rewrite rules

These are owner-ratified patterns from the trial rounds. Apply them confidently; new
rules get edited in here as the owner harvests them.

**Joins.** When removing an em dash or resolving a clause-joining colon or semicolon,
prefer in order: delete the joined fragment if it adds nothing, split into two sentences
fronted by the connective the punctuation implied ("Therefore,", "Meaning,"), join with
a plain conjunction, recast the second clause as a relative clause ("where", "which")
when it restricts the first, or parenthesize a trailing appositive. A colon or semicolon
is the last resort. A conditional sentence ("If X, Y: A, B, C") already carries enough
load, so move its elaboration to a new sentence.

**Contrast and negation.** Delete trailing ", not X" and ", never X" contrasts; when the
negation corrects a real, likely misreading, recast it with "rather than". A bolded rule
name that other documents quote keeps its wording, and its paraphrase takes "rather
than". Recast a standalone "It is not X" or "This is not X" frame as what the reader
should do or believe; keep the pair when the next sentence supplies the positive half.
In "No X does Y because Z" shapes, insert "just because" or restructure so the negation's
scope is unambiguous.

**Fragments and elision.** Give every clause its verb and every sentence its subject.
Restore dropped relative pronouns ("the contract that X consumes") and articles. Give a
colon-introduced list a governing verb ("it covers:", "may include:") and an example set
a lead-in ("such as:", "including:"). Join adjacent short sentences that carry one
claim; the split direction from the standard's grammar defaults still dominates.
Partitive and comparative phrases ("the less useful half", "the other side") name their
comparison set in the same sentence, keeping any hedge.

**Lists.** A colon-introduced list takes commas; when one item needs an aside,
parenthesize the aside rather than promoting the list to semicolons. An inline
enumeration of roughly four or more items takes a colon introduce or becomes bullets. A
paragraph carrying two or more bolded named items becomes a bulleted list, one item per
bold, with the opening sentence as the lead.

**Bold.** Bold that labels stays: at the head of an item, before a colon or gloss,
shared by sibling items. Bold inside a running sentence is stress and comes off,
including pre-existing bolds. A lone bolded lead in an otherwise plain list comes off.

**Headings and names.** A heading names its section and stops; move caveats, teasers,
and counts into the body. Runnable tool and command names take code spans on every
mention. Recast coined verbs ("re-verdicted") around the plain noun.

**Directives.** In agent-facing guidance, restate prohibitions as the action to take.
Keep the prohibition where the positive form would be narrower than the rule or where a
code gate enforces it.

**Content cuts.** These delete claims, so apply them and name them in the report: a
sentence narrating an artifact's importance after its definition, a recap of a linked
artifact beyond the contrast this document needs, a value another artifact owns restated
here (cut to the pointer), and cross-reference inventories, ordinals, sibling
quotations, or retold incidents (point by path and stable concept name instead).

**Route to the owner.** Two relocations stay owner-gated: a justification passage
(measurement, citation, or incident beside a rule) gets flagged with where its evidence
lives, and a README section stating policy a skill owns or logging dated history gets
flagged as a relocation candidate.

## Verification

- `slopcheck <target>` clean or every flag explained, shown in the report.
- The fact-walk over each diff, stated as performed.
- `slopcheck` is this skill's own tool: `slopcheck.py` beside this file, linked
  onto PATH by the kit install. If the link is missing, run the script directly
  with `python3`. Its harnesses live in `tests/`; run them after any edit to the
  script (`python3 tests/test_cli.py ./slopcheck.py`, and likewise for
  `test_behaviors`, `test_overlay`, `test_technical`, `test_notation`).
