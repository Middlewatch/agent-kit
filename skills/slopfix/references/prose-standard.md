# Prose standard

**Status: active; ratified by owner 2026-08-06.** This standard governs the
written artifacts the estate produces: wiki notes, READMEs, design bases,
plans, review reports, commit messages, and the explanatory prose in a session
answer.

`slopcheck` is the deterministic gate for the mechanical half of this document
(the `slopfix` skill's own tool, `slopcheck.py` in that skill's directory). The
judgment half is not deterministically
scoreable and is checked by re-reading against the tests below. The `slopfix`
skill is the editing pass that brings an existing document in line with this
standard. When a document also carries stale build state, the `as-built` skill
runs first. It syncs content truth, and `slopfix` then works on expression.

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
`~/.agents/wiki/knowledge/local-ai/llm-text-homogeneity-detectability.md`.)

The problem is most acute in creative writing. For technical writing, this
estate optimizes for five properties, enforced in review no matter who wrote
the text:

1. Specifics are real.
2. Later sentences depend on earlier ones.
3. Sentence density varies.
4. Clarity is weighted more heavily than conciseness.
5. Every sentence should be understandable to both a human and machine reader.

Optimize for these and the surface tells stop appearing on their own; there is
no room for them. That is why the avoid list below is secondary.

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

Every specific comes from the repo, the run, the source, or the owner. Never
invent a file name, a version, an error string, a benchmark number, a citation,
or an outcome. If the substance is not there, ask for it or write a thinner
honest draft and say what is missing. This rule outranks everything else in this
document. A fabricated specific is a false claim wearing the costume of
evidence, and it destroys the only property that cannot be faked.

Corollary for reports: a number you did not measure does not go in the
artifact. If you measured it, say how. If you estimated it, state that clearly.

## The tests

Apply after drafting:

**Dependency.** Could a paragraph be moved elsewhere in the document without
loss? If yes, the argument is a stack of self-contained units rather than a
chain. Repair by making a later sentence inherit a constraint from an earlier
one, e.g. a term it defined, a number it established, a tension it opened.

**Density.** Does information arrive at a constant rate? Uniform density is the
signature failure where every idea is given the same three sentences regardless
of weight. Repair by compressing the parts the reader can infer and letting the
load-bearing part breathe. You do not need to explain everything.

**Stakes.** Is there an opinion, a trade-off named as a trade-off, a thing
that almost went wrong, or a cost? Flat affect across an entire document means
the writer had no position, which for a technical artifact usually means the
thinking is not finished.

These tests come with their own failure mechanisms, though. To properly
assess if the three tests have been effectively applied, the reviewer must ingest
the document in full. If Dependency has been established, it does not need to be
repeated. If a particularly dense section retains value based on the document
surrounding it, it does not need to be arbitrarily compressed. If the stakes
have been stated, they do not need to be overstated.

Negative parallelism, overemphasis, and making very strong claims are all
points where an LLM will tend to raise the stakes and overstate claims where a
human writer would exercise restraint.

## Type discipline

A document should serve one purpose. Mixing purposes is the most common structural
defect across this estate's docs, and it is why a reader who needs one thing has
to read all four types' worth of prose. The four purposes (Diátaxis):

| Type | Reader's need | Never contains |
|---|---|---|
| **Tutorial** | Teach me from zero | Alternatives, theory, edge cases |
| **How-to** | Solve this problem now | Fundamentals, long explanation |
| **Reference** | Look something up | Problem-solving, rationale |
| **Explanation** | Help me understand why | Setup steps, API listings |

Explanation is the type where discursive prose is the right register.
Reference should be generated from the source where it can be, because
generated reference cannot drift.

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
- **Session answer to the user**: answers first, then reasoning, then
  caveats. Connected prose for conceptual explanation; a list only where
  drafting rule 2 calls for one: parallel items that are independently useful.

## Drafting judgment rules

Ten judgment rules for sentence-level drafting. Apart from rule 9's
em-dash exclusion (an owner ruling), each is a contextual choice, not a
quota, a template, or a ban. Apply a rule where the passage calls for it
and ignore it where it does not. No word is forbidden.

1. End a sentence when the claim is complete; retain a trailing contrast,
   qualifier, or rhetorical close only when it changes truth or action.
2. Turn a dense inline enumeration into bullets when the items are parallel
   and independently useful; keep a short sequence in prose.
3. State the claim instead of narrating that it is important, explicit,
   recorded, or worth knowing.
4. Prefer plain, literal technical language over praise, drama, or metaphor.
5. Make the useful content edit: front-load the verdict, name ambiguous
   antecedents and counts, and cut origin stories or clarifying negatives
   that do not affect the reader's decision.
6. Preserve or add a hedge when uncertainty requires it; do not add
   reassurance or certainty merely to make the paragraph sound complete.
7. Aim for varied mid-length sentences: split colon/dash/semicolon compounds
   whose halves carry separate claims, but join choppy fragments that carry
   one claim. Name the causal or logical connective when punctuation was
   doing that work.
8. Use `This` for an unambiguous established antecedent and front
   `Therefore,` when it genuinely states the prior sentence's consequence;
   neither is a quota or mandatory template.
9. Do not use em dashes. Where one would interrupt, use parentheses;
   where it would connect or introduce, use a colon, a semicolon, or a
   new sentence. Use bold/italic emphasis sparingly. Emphasize only
   what the stakes justify across the whole passage; no
   individual intensifier is banned. Bold on a list or definition
   label is structural, not emphasis, and is fine (owner ruling,
   2026-08-14).
10. Cut or sharpen a sentence that could appear unchanged in another
    project's documentation. A sentence earns its place by naming a
    fact, number, or instruction specific to this subject; guidance
    documents restating each other is the same defect at corpus scale.

### Sentence grammar defaults

Five owner-ruled defaults (2026-08-14), narrower than the judgment
rules above: sentence grammar rather than voice.

1. A colon introduces a list, an example set, or a label. When a
   colon joins two full clauses, split at the colon and name the
   connective it was implying.
2. A semicolon earns its place. Resolution order for a join: period
   plus connective, then plain conjunction, then semicolon only when
   the two ideas genuinely form one thought.
3. Hunt run-ons by enumeration, not opportunism: treat every long
   compound sentence as a split candidate and resolve it with periods
   and joining words.
4. Generic pronouns pass a referent check. When "it", "this",
   "that", or "they" could bind to more than one preceding noun, name
   the subject instead. An unambiguous fronted pronoun is good prose,
   so this is a check, not a ban.
5. Exactly two parallel items conjoin with "and" or "or", never a
   bare comma.

## The avoid list

These are real but secondary. `slopcheck` scores them so you do not have to
carry them in working memory. The word lists rot: tells drift as vendors
train them down and humans absorb them into the baseline (`delve` peaked
and fell in academic writing within about a year of being publicized).
Therefore, the lexicon gets re-grounded against current corpus studies
periodically rather than treated as fixed.

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
- **Typography tells**: curly quotes and decorative emoji in headings or
  bullets. Write straight quotes and let the words carry the decoration;
  `slopcheck` scores both.
- **False ranges**: "from X to Y" where X and Y sit on no meaningful
  scale ("from chatbots to agents to the enterprise"). Name the items
  directly. This one is judgment, not machine-scored: a real range
  ("from 2 ms to 40 ms") is fine.

Deliberately not on this list: em dashes, which drafting rule 9 excludes
outright, so scoring them here would be redundant; sentence fragments; and
the second person. Policing fragments and the second person produces
stilted prose and buys nothing.

## What this standard does not do

It does not set a house voice for creative or personal writing. It does not
apply to append-only ledgers: changelogs, execution logs, and journal entries
keep the terms of their moment. It does not govern code comments beyond the
grounding rule. And it does not make a document good. We are just trying to
reduce the ways that documentation is consistently bad.

## Verification

- `slopcheck <file>`: deterministic scoring of the avoid list and sentence
  shape (length variance and band share). It is a stylistic lint, not a
  detector; per-document AI detection is unreliable in the general case and
  that is not what this tool claims. Advisory on a draft; a gate where a
  project chooses to wire it into `scripts/verify.sh`.
- The three tests above, applied by re-reading. Not scoreable.
- For any artifact making measured claims: every number traceable to the run
  that produced it.
