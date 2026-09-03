---
name: deep-research
disable-model-invocation: true
description: "Two research modes in one skill. Research mode is orchestrator-led search with Agent-tool subagents where the topic spans domains. Deep mode (on request, or when the question is wide) runs a Workflow fan-out of fresh-context researchers per sub-question with adversarial verification. Every run ends with: a citation-linted report filed into ~/.agents/wiki and sources appended to the lane's link-map. Use for any research ask whose answer should persist."
---

# Deep research (two modes)

Every run ends identically: a cited report per `references/report-spec.md`, filed into
`~/.agents/wiki`, its sources appended to the lane's link-map so future agents can find them by
grep. The mode only decides how evidence gets collected. You are the
orchestrator in both modes and the sole writer/filer of the final report.

## Pick the mode

| mode | shape | reach for it when |
|------|-------|-------------------|
| **research** (default) | you drive the search and subagents assist | most questions: a factual lookup, a comparison, a "how does X work", anything a focused reader settles with 5–15 sources |
| **deep** | Workflow fan-out: fresh-context researchers per sub-question, independent refuters per claim | the user says "deep research" / "comprehensive" / "collect everything", or the question needs many sources across source *types* (papers + vendor docs + practitioner reports), or it decomposes into 4+ independently-researchable sub-questions |

Explicit user wording wins. When in doubt, start in research mode. If scoping reveals the
question is wider than it looked, say so and escalate to deep mode with the scoping work kept.

## 0. Scope (both modes)

Restate the question as a verifiable goal. When the goal is genuinely underspecified (missing budget,
region, timeframe, use-case, or definition of "best"), ask the user clarifying questions first. A
sharp question is worth more than ten searches against a vague one.

## Research mode (default)

1. **Define the angles.** Find 2–4 angles that jointly settle the question. Additionally, include the
   counter-case when the topic has a controversy or hype dimension.
2. **Search–read–compact loop.** Run several searches with varied phrasings
   (WebSearch), fetch and read the promising primary sources (WebFetch), then
   write compact findings notes (claim / URL / date / short quote) and move on.
3. **Delegate domains.** When the topic spans 2+ distinct domains, keep
   the primary domain and send one Agent-tool researcher per extra domain. Hand them a well formed
   prompt and ensure they abide by the contract outlined in this skill.
4. **Verify.** For each load-bearing claim, use one fresh-context Agent-tool refuter
   that actively searches for independent contradiction. Verification belongs in a context that
   didn't form the belief. Claims lacking independent confirmation ship marked **[unverified]**.
5. **Finish** outlined below.

## Deep mode

1. **Decompose** into sub-questions that jointly settle the main question, each independently
   researchable. Two coverage rules:
   - **Source-type coverage:** when the question asks what evidence supports, aim at least one
     sub-question at measured/academic evidence (papers, benchmarks, studies) and one at
     practitioner or critic reports. Vendor docs alone answer only what vendors say.
   - **Counter-case coverage:** when the topic has a controversy, failure-mode, or hype angle,
     spend one sub-question on it on purpose.

   Breadth: **standard** is 4–6 sub-questions (default), and **exhaustive** is 8–12 plus
   3-refuter majority panels (user says "thorough"/"comprehensive", or the stakes are high).
2. **Run the engine** via the Workflow tool from `references/workflow-template.js` with
   `args = { question, subQuestions, breadth: 'standard'|'exhaustive' }`. It fans out one
   fresh-context researcher per sub-question, selects load-bearing claims across all findings,
   sends independent refuters per claim, and returns findings + verdicts + stats. Adapt prompts
   to the topic where useful, but keep the architecture.
3. **Synthesize yourself** from the returned findings and verdicts, per
   `references/report-spec.md`: answer up front, themes over sources, inline `[n]` citations
   resolving to sources actually read. A refuted load-bearing claim appears as contested with
   its counter-evidence, and an unconfirmed claim carries **[unverified]** inline. State inference
   as inference.

When the Workflow tool is absent this session, run the same architecture with parallel
Agent-tool subagents (researchers first, then refuters, then synthesize yourself).

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
