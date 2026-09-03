---
name: deep-research-pi
disable-model-invocation: true
description: "Two research modes in one skill. Research mode is orchestrator-led search with delegated typed children where the topic spans domains. Deep mode (on request, or when the question is wide) fans out fresh-context typed researchers per sub-question over the delegate surface, with independent refuters per load-bearing claim. Every run ends with: a citation-linted report filed into ~/.agents/wiki and sources appended to the lane's link-map. Use for any research ask whose answer should persist."
---

# Deep research (two modes)

Every run ends identically: a cited report per `references/report-spec.md`, filed into
`~/.agents/wiki`, its sources appended to the lane's link-map so future agents can find them by
grep. The mode only decides how evidence gets collected. You are the
orchestrator in both modes and the sole writer of the final report.

The engine is the agent-delegate extension's `delegate` tool with its named research agents
and a per-child `resultSchema`: bounded fresh-context children with web access whose final
message is one JSON object validated against the caller's schema.

## Pick the mode

| mode | shape | reach for it when |
|------|-------|-------------------|
| **research** (default) | you drive the search; delegated typed children assist | most questions: a factual lookup, a comparison, a "how does X work", anything a focused reader settles with 5–15 sources |
| **deep** | delegate fan-out: fresh-context typed researchers per sub-question, independent refuters per claim | the user says "deep research" / "comprehensive" / "collect everything", or the question needs many sources across source *types* (papers + vendor docs + practitioner reports), or it decomposes into 4+ independently-researchable sub-questions |

Explicit user wording wins. When in doubt, start in research mode. If scoping reveals the
question is wider than it looked, say so and escalate to deep mode with the scoping work kept.

## 0. Scope (both modes)

Restate the question as a verifiable goal. When the goal is genuinely underspecified (missing budget,
region, timeframe, use-case, or definition of "best"), ask the user clarifying questions first. A
sharp question is worth more than ten searches against a vague one.

## The delegation surface (both modes)

There are two child roles, carried by the extension's versioned agent definitions
(`agent` param; both are research-profile children with web access):

- **`agent: "researcher"`**: the brief carries the main question, one sub-question or domain
  angle, and the coverage obligations; `resultSchema` is the verbatim content of
  `references/findings.schema.json`.
- **`agent: "refuter"`**: the brief carries one claim, its original source URL, and an explicit
  instruction to search for independent contradiction; `resultSchema` is the verbatim content
  of `references/verdict.schema.json`. The refuter definition escalates to the judge tier by
  default, because verification belongs in the strongest reasoning class.

Typed-return obligations: every child's final message is validated against the schema by the
extension and fails closed on invalid data. There is no repair pass, and no second model may
invent facts absent from the child's evidence. A validation failure surfaces as a typed error
naming the child. On a typed error, re-delegate once with a sharper brief; a second failure
marks that sub-question's claims (or that claim) **[unverified]**. Leave an invalid return
invalid, since the schema gate is the anti-fabrication boundary.

Scheduling: emit the `delegate` calls together so they run concurrently. Target at least 8
concurrent children when the work decomposes that far; never more than 12. The typed pool
bound refuses a 13th concurrent call, so queue the remainder behind the first completions.

Model routing: the extension owns every model slug in its tier table. Research children
default to the analyst tier; the orchestrator may escalate a hard sub-question with the `tier`
(`judge`) or `thinking` (`high`) params, and can never name a model.

## Research mode (default)

Orchestrator-led: your context holds the whole picture, delegated children cover the ground
you'd otherwise cover thinly.

1. **Sketch the angles.** 2–4 angles that jointly settle the question, including the
   counter-case when the topic has a controversy or hype dimension.
2. **Search–read–compact loop, one angle at a time.** Several searches with varied phrasings;
   `web_fetch` and read the promising primary sources; write compact findings notes
   (claim / URL / date / short quote) and move on. The notes are what carries forward, and a page's
   job ends at extraction. This discipline is what keeps one context deep instead of full.
3. **Delegate the domains you'd shortchange.** When the topic spans 2+ distinct domains (e.g. a
   hardware question with a legal angle), keep the primary domain and send one researcher
   child per extra domain, per the delegation surface above.
4. **Verify before writing.** For each load-bearing claim (the ones where being wrong changes
   the conclusion): one refuter child, per the delegation surface above, because verification belongs
   in a context that didn't form the belief. Claims lacking independent confirmation ship
   marked **[unverified]**.
5. **Finish** per the shared finish below.

## Deep mode

### 1. Decompose

Write the sub-questions whose answers jointly settle the main question, each independently
researchable (a researcher who sees only that sub-question and the main question can still do
useful work). Two coverage rules, both learned from graded runs:

- **Source-type coverage:** when the question asks what evidence supports, aim at least one
  sub-question at measured/academic evidence (papers, benchmarks, studies) and one at
  practitioner or critic reports, since vendor docs alone answer only what vendors say.
- **Counter-case coverage:** when the topic has a controversy, failure-mode, or hype angle,
  spend one sub-question on it on purpose ("where does X fail / what do critics say?").

Breadth: **standard** 4–6 sub-questions (default); **exhaustive** 8–12 (user says "thorough"/
"comprehensive", or the stakes are high).

### 2. Phase A: research fan-out

One researcher child per sub-question, all `delegate` calls emitted together so they run
concurrently per the scheduling rule above. Read each returned findings object; collect any
`gaps`.

**Partial failure is normal.** A child whose return fails validation surfaces a typed error
naming the child; re-delegate that sub-question once with a sharper brief, and where the
second attempt also fails, carry the sub-question's angles as **[unverified]** rather than
dropping the angle silently.

### 3. Phase B: select load-bearing claims (you, in your own context)

You hold the full cross-researcher picture, so select the claims yourself: the ones the final
answer stands on, where being wrong would change the conclusion. Take surprising, single-sourced, or
decision-driving claims first. Cap: standard ≤6, exhaustive ≤10.

### 4. Phase C: verify fan-out

One refuter child per selected claim, per the delegation surface above. Fresh context
guarantees each claim is judged by a researcher that had no hand in producing it. At exhaustive
breadth, run 3 refuters per claim and let the majority decide; at standard, the single
refuter's verdict stands. That asymmetry is deliberate. At exhaustive breadth the 8–12
researchers fill the typed pool, so schedule refuters behind researcher completions.

### 5. Phase D: synthesize (you, sole writer)

Write the report yourself from the verified findings, per `references/report-spec.md`: answer up
front, themes over sources, inline `[n]` citations that resolve to sources actually read. A
refuted load-bearing claim appears as contested with its counter-evidence; an unconfirmed claim
carries **[unverified]** inline. State inference as inference. Then the shared finish.

## Shared finish

1. **Citation lint (code gate):**
   `python3 ~/.agents/kit/skills/deep-research/bin/citation-lint.py <report.md>`. Fix anything
   it names and re-run until exit 0.
2. **File to the wiki** per `references/report-spec.md` §Wiki filing. The existing-note check
   comes first. A note already covering the topic gets updated in place, and a new note is for
   a new topic. Filing into existing lanes is automatic. Propose new lanes to the user.
3. **Sources ledger:** append the run's section to `~/.agents/wiki/<lane>/link-maps/<domain>.md`
   per report-spec §Sources ledger.
4. **Report the run stats** to the user: mode and breadth, children launched, output tokens
   if known, and the filed path.

## Verification

Two live-research rows cost real searches, so run them after changing this skill or the
delegate surface:

| row | run | expect |
|-----|-----|--------|
| researcher | one `delegate` call, `agent: "researcher"`, `resultSchema` = the verbatim content of `references/findings.schema.json`, brief: "What is the current stable Node.js LTS major version? Answer with findings per the schema." | schema-valid JSON: a `findings` array with at least one finding whose `sourceUrl` is on nodejs.org |
| refuter | one `delegate` call, `agent: "refuter"`, `resultSchema` = the verbatim content of `references/verdict.schema.json`, brief: "Attempt to refute this claim using independent sources: 'Node.js 24 is the current stable LTS major version.'" | schema-valid JSON: a `refuted` boolean and a `reason` |

Caller schemas must stay within the delegate surface's documented subset (`type`, `properties`,
`required`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`,
`minItems`, `maxItems`, `description`, `additionalProperties`; 8 192 bytes serialized). The two
reference schemas are maintained inside that subset. Stay inside it (no `$schema`, `$ref`, `format`,
or any other off-list keyword), since off-list schemas fail closed at call time.
