# Prose standard

**Status: active; ratified by owner 2026-08-06.** This standard governs the
documents the estate produces: wiki notes, READMEs, design bases, plans,
review reports, and commit messages. The sentence-level defaults in
`~/agent-kit/AGENTS.md` apply to replies and documents alike; this standard adds
the document-level rules.

This document owns document-style preferences. The `slopfix` skill owns the
editing procedure. Its `slopcheck.py` CLI locates patterns for contextual review
and flags explicit house typography conventions; it does not score writing
quality. See `~/agent-kit/skills/slopfix/README.md` for its coverage and limits.
A prose pass preserves substantive information. Content corrections and
relocations require a task that includes them, rather than following from a
style finding.

## Claim

LLM-written text degrades in a patterned, predictable way. LLM output measurably
clusters where human output spreads: frontier-model fiction occupies a narrower
region of narrative space than human work ([StoryScope, COLM
2026](https://arxiv.org/abs/2604.03136)), co-writing with an aligned model
reduces the collective diversity of essays ([Padmakumar & He, ICLR
2024](https://arxiv.org/abs/2309.05196)), and the style signature is visible at
population scale across fifteen million biomedical abstracts ([Kobak et al.,
Science Advances 2025](https://arxiv.org/abs/2406.07016)). The clustering
manifests in visible tells: focal vocabulary, the closing ritual, the tidy
tricolon, the "it's this, not that" contrast, negative parallelism, em dashes
as default connectives or trailing flourishes rather than interruptions. Each
model also carries its own idiosyncrasies. Classifiers attribute text to its
source model with high accuracy while that model version stays fixed, and the
signal survives paraphrase because it lives partly in content rather than word
choice ([Sun et al., ICML 2025](https://arxiv.org/abs/2502.12150)). Scrubbing
the surface layer only makes prose worse. Paraphrase can beat any fixed
detector, but the structural and corpus-level clustering has survived every
scrubbing attack tested so far. Additionally, cosmetic rewriting spends effort
hiding the signature instead of fixing the writing. (Full evidence audit with
counter-cases:
`~/agent-kit/wiki/knowledge/local-ai/llm-text-homogeneity-detectability.md`.)

The problem is most acute in creative writing. For technical writing, this
estate optimizes for five properties, enforced in review no matter who wrote
the text:

1. Specifics are real.
2. Explanations connect claims; reference entries stand on their own.
3. Detail reflects the reader's need and the subject's complexity.
4. Clarity is weighted more heavily than conciseness.
5. Every sentence should be understandable to both a human and machine reader.

These properties matter more than surface patterns. A useful passage can
contain a listed word or regular sentence lengths; neither makes it defective.

The goal for all output across the estate is prose that is clear, grounded, and
worth a reader's time. Prose that also reads as human-written is a positive
consequence, but not actually the target. Writing aimed at passing as human
rather than at being true fails differently. For example, the default
LLM register does not meander across thoughts and still arrive back at the
point. Mimicry attempted from inside that register surfaces the same tells
it is trying to hide. The register is steerable. That is what makes optimizing
for the real properties work. But steering toward "sounds human" instead of
toward substance just relocates the clustering.

## Grounding Rule

Never present an invented file name, version, error string, number, citation,
or outcome as observed. This rule outranks everything else in this document.

Represent each specific according to its evidence. Observations come from the
repo, a run, a source, or the owner. Attribute source-reported claims; label
estimates and inferences. Proposed filenames, hypothetical examples, and
illustrative numbers are useful when clearly identified as proposals or
illustrations. Presenting them as observed facts would be fabrication.

For measurements, identify the run and method, or cite the source that reports
them. For estimates, state the basis and uncertainty. If evidence is missing,
say what remains unknown; ask only when that input is needed to complete the
task. Grounding and preservation of meaning outrank style preferences.

## The tests

Choose tests by reader need after drafting. Read the document in full before
judging its structure.

For explanatory arguments:

- **Dependency.** Can the reader follow how a conclusion uses earlier evidence
  or constraints? Supply a missing connection when the argument needs it.
  Independent findings and reference entries need no artificial dependency.
- **Density.** Does each point get the detail needed to understand it? Compress
  repetition and explain difficult steps. Regular sentence lengths alone do
  not warrant a rewrite.
- **Stakes.** Where the document recommends a decision, does it explain the
  relevant consequence or trade-off? Neutral description needs no manufactured
  opinion, incident, or drama.

For reference material, check findability, completeness for the stated scope,
and whether each entry can be understood independently. For procedures, check
step order, prerequisites, and whether the reader can recognize success.

Established connections, useful density, and stated consequences need no
further emphasis. Preserve necessary uncertainty and qualifications.

## Type discipline

Give a document one primary reader need. Supporting sections can serve other
needs when they help the reader act or understand; separate them when mixing
makes the requested information hard to find. The four purposes (Diátaxis):

| Type | Reader's need | Usually belongs elsewhere |
|---|---|---|
| **Tutorial** | Teach me from zero | Alternatives, theory, edge cases |
| **How-to** | Solve this problem now | Fundamentals, long explanation |
| **Reference** | Look something up | Problem-solving, rationale |
| **Explanation** | Help me understand why | Setup steps, API listings |

Explanation is the type where discursive prose is the right register.
Generate reference from the source where practical, and check that generated
output stays synchronized with that source.

House artifacts map onto these: a design basis is explanation; a plan is
reference plus how-to; a review report is explanation with a reference
appendix; a README is a how-to with an explanation paragraph at the top; a
wiki note is usually explanation and should say so by being one.

## Register by artifact

- **Wiki note**: states one durable idea in its first two sentences, with the
  evidence that makes it durable. Skips session context, phase and packet
  codes, and dates except where the date *is* the fact. Conveys only the idea
  that is meant to be saved.
- **README**: front-loads what a stranger needs to understand what this is;
  the shortest possible path to understanding.
- **Design basis**: describes the what and the why of the product or project
  as a durable specification for decisions and structure, and names rejected
  alternatives and the reasons they lost.
- **Plan**: leads with decisions and details construction from start to
  finish; the build's how-to roadmap.
- **Review report**: states the most important finding first, keeps every
  claim traceable to a line, a run, or a measurement, and marks each claim's
  severity and certainty (or uncertainty).
- **Commit message**: opens with an imperative subject under about 50
  characters; the body explains why and avoids restating what the diff
  already shows.

## Drafting judgment rules

The always-on defaults in `~/agent-kit/AGENTS.md` (em dashes, quotes, bold,
trailing contrasts, colons and semicolons, pronoun referents, grounding,
hedges, leading with the finding) apply to every document and are not
repeated here. The rules below are document-level judgment calls: apply
each where the passage calls for it and ignore it where it does not. No
word is forbidden.

1. Turn a dense inline enumeration into bullets when the items are parallel
   and independently useful; keep a short sequence in prose.
2. State the claim instead of narrating that it is important, explicit,
   recorded, or worth knowing.
3. Prefer plain, literal technical language over praise, drama, or metaphor.
4. Name ambiguous counts. Cut origin stories and clarifying negatives that
   do not affect the reader's decision.
5. Aim for varied mid-length sentences: split colon/dash/semicolon compounds
   whose halves carry separate claims, but join choppy fragments that carry
   one claim. Name the causal or logical connective when punctuation was
   doing that work.
6. Use `This` for an unambiguous established antecedent and front
   `Therefore,` when it genuinely states the prior sentence's consequence;
   neither is a quota or mandatory template.
7. Emphasize only what the stakes justify across the whole passage; no
   individual intensifier is banned.
8. Review generic sentences for useful information. Prefer a relevant fact
   or instruction to an empty quality claim. Shared guidance and necessary
   definitions can remain generic; do not invent specifics to make them
   sound distinctive.

### Sentence grammar defaults

Owner-ruled defaults (2026-08-14), narrower than the judgment rules above.
Colons, semicolons, and pronoun referents are in the always-on defaults;
these three add to them. Apply them when they improve comprehension; clear
fragments, labels, and compact instructions can stay.

1. Resolution order for a join: period plus connective, then plain
   conjunction, then semicolon only when the two ideas genuinely form one
   thought.
2. Review long compounds for run-ons. Split when independent claims or
   buried qualifications make the sentence hard to follow.
3. In running prose, join two parallel items with "and" or "or" when
   a bare comma would leave their relationship unclear.

## The avoid list

These patterns are candidates for review, not forbidden vocabulary.
`slopcheck` locates the supported patterns; a match does not establish misuse.
The word lists rot: tells drift as vendors train them down and humans absorb
them into the baseline (`delve` peaked and fell in academic writing within
about a year of being publicized). Therefore, the lexicon gets re-grounded
against current corpus studies periodically rather than treated as fixed.

- **Focal vocabulary**: delve, tapestry, realm, pivotal, intricate,
  meticulously, multifaceted, seamless, leverage (as a verb), testament,
  foster, elevate, underscore, showcase, landscape, paradigm, holistic,
  transformative, ever-evolving, beacon, cornerstone, bedrock.
- **Signposting filler**: "it's worth noting," "at its core," "when it comes
  to," "in the realm of," "plays a pivotal role."
- **Closing rituals**: "in conclusion," "in summary," "overall,"
  "ultimately," "hope this helps," "let me know if you'd like me to go deeper."
- **Rhetorical reflexes**: the negated contrast ("it's not X, it's Y") used
  as decoration rather than as a real correction; the flattened tricolon
  ("Fast. Simple. Effective."); the participial tail ("…, marking a pivotal
  moment in…"); hedge-and-reassure stacks.
- **Sycophantic openers**: "great question!", "you're absolutely right."
- **Promotional adjectives** on non-promotional subjects.
- **Typography conventions**: use straight quotes in authored prose and avoid
  decorative emoji. Preserve literal quotations and meaningful symbols.
  `slopcheck` flags curly quotes and reports possible emoji for review; it
  cannot determine whether either is required by the subject.
- **False ranges**: "from X to Y" where X and Y sit on no meaningful
  scale ("from chatbots to agents to the enterprise"). Name the items
  directly. This one is judgment, not machine-scored: a real range
  ("from 2 ms to 40 ms") is fine.

`slopcheck` flags em dashes, which the always-on defaults ban outright; that
flag is always a fix. Sentence fragments and
second-person address are not defects by themselves; keep them when they serve
the reader.

## What this standard does not do

It does not set a house voice for creative or personal writing. It applies to
every document an agent drafts, ledger entries and changelogs included, but an
entry already written keeps the terms of its moment. It does not govern code
comments beyond the grounding rule. And it does not make a document good. We
are just trying to reduce the ways that documentation is consistently bad.

## Verification

- `slopcheck -w <file>` locates supported patterns and reports approximate
  sentence statistics. Vocabulary, shape, and ambiguous notation findings are
  advisory. Only em-dash and curly-quote flags affect its failure status. An
  em-dash flag is unconditional; a curly-quote flag inside a quoted literal
  is the one case to review before changing.
  The tool measures neither writing quality nor AI authorship.
- Re-read using the tests for the document's reader need. A clean lint result
  does not replace that review, and correct wording may retain findings.
- Check factual claims against their evidence and distinguish measured,
  source-reported, estimated, proposed, and illustrative specifics.
