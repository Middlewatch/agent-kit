---
name: why
description: "Use for 'why does X work this way', 'why did we pick Y', design rationale, the history of a decision, dead code, or 'where did this number come from'."
---

# Why

Reconstruct the motivation behind code or a decision from the estate's recorded evidence,
with confidence calibrated to what the record actually supports.

Companion to the `how` walkthrough prompt (`~/.agents/kit/prompts/how.md`): `how`
answers what the code does, `why` answers what forces gave it
that shape. It reads from the estate's capture skills: `adr` records decisions in
`docs/adr/`, `harvest` records surprises in language packs and `~/.agents/inbox/`,
`vet-dependency` records adoption verdicts in the introducing commit's message, and
the separately installed `autojournal` extension records session deliberation in
`~/.agents/journals`.

## Outcome and boundaries

Success is an answer whose every claim sits in a confidence tier backed by a citation,
plus an honest coverage map of what was searched. "The record doesn't say" is a valid
and valuable answer. This skill investigates and reports.

Read `references/epistemics.md` before synthesizing.

## Step 1. Anchor

Parse the target (a chunk of code, a constant, a pattern, a named decision) and the
question. If the target is vague, state your best-guess interpretation and proceed; the
owner will redirect in flight if needed.

Anchor in concrete code: file paths, line ranges, key symbols, and the last few commits
touching the target. Then run a `memory_search` on the target's name and symbols when that tool is
present (the `autojournal` extension supplies it). It is the cheapest source and often
ends the investigation in one step.

## Step 2. Sweep the record (single lead, default)

Work through the source map inline, in root context. Track a coverage map as you go:
for each category, what you searched and what came back, including nulls. A null is
evidence about how the decision was made; record it rather than skipping the search.

1. **Source control.** `git log --follow`, `git log -S '<exact string>'`, `git blame`,
   `git show`; `gh` for PR and issue discussion when the repo has a remote. Dependency
   rationale lives in the commit that introduced the dependency, per `vet-dependency`.
   Full playbook: `references/code-archaeology.md`.
2. **Decision record.** `docs/adr/` in the target repo, `CONTEXT.md`, specs, README and
   other in-repo docs.
3. **Memory.** Follow the Step 1 `memory_search` hits with `memory_get`; run follow-up
   searches on names surfaced by the other categories. The journal is this estate's
   conversational record: the deliberation other teams keep in chat lives here.
4. **Harvested findings.** The relevant language pack under
   `~/.agents/reference/coding-languages/` and the references of any skill involved in
   the original work. When the target looks defensive (retry, timeout, guard, null
   check), the motivating bug's debugging saga is usually a journal entry or a pack
   finding.
5. **Upstream.** For third-party behavior or a pinned version, the dependency's
   changelog, issues, and release notes via web search.

Stop sweeping a category when it answers the question or goes cold, and say which.

## Step 3. Escalate on breadth (optional)

Delegate only when a trail demands a sweep too large for root context. Git archaeology
stays at the root: children get status and diff only, and no `gh`. Give each child the
anchor from Step 1 and `references/investigator-prompt.md`.

## Step 4. Synthesize and present

Write the output for the user. Use this format:

```markdown
### The Question

Restate the users question in one or two sentences.

### The Code in Question

File paths, line ranges, key symbols. Two or three lines to orient a reader who lands here cold.

### What We Found

**Claims with direct evidence**, one per bullet. Quote or paraphrase the source and cite precisely. Format each finding like:

- **[Direct]** {Claim}. Source:
- **[Supported]** {Claim}. Evidence:

Use `[Direct]` for single-source, explicit evidence. Use `[Supported]` when multiple indirect items converge on a conclusion.

### What We Can Reasonably Infer

**Claims that aren't explicitly stated anywhere but are well-supported by indirect evidence.** Make the inference chain visible: "Given A and B, it's likely that C." Use hedged language ("appears to", "likely", "suggests", "is consistent with"). Format:

- **[Inferred]** {Hedged claim}. Reasoning: {the specific evidence and the inference step}.

If there's nothing to infer, skip this section.

### Competing Hypotheses

**If the evidence fits multiple stories, present them.** Don't force a winner when the record doesn't support one. For each hypothesis:

- **Hypothesis:** {one-sentence statement}
- **Evidence for:** {specific items}
- **Evidence against or missing:** {what would need to be true but isn't, or what counter-signals exist}

Skip this section if there's a single clear answer.

### What We Don't Know

**Explicit gaps.** Things the user asked that the evidence didn't answer. Sources searched that came up empty. Sources that weren't searchable at all.

- Specific questions that went unanswered
- Searches that returned nothing
- Sources that were unavailable (and why)

### Sources Consulted

Bulleted list of what was actually searched, so the user can judge coverage and redirect.

### Confidence Summary

One or two sentences summarizing your overall confidence.
```

Run the calibration check at the end of `references/epistemics.md` before delivering.
If the owner offered a hypothesis in the question, treat it as one candidate and test
it against the record rather than confirming it.

## Step 5. Close the loop

When the investigation reconstructs a rationale that exists nowhere durable,
capture it: an ADR via the `adr` skill if it is a decision, a wiki note otherwise.

## Failure modes to avoid

- **Confident storytelling.** An uncited claim goes in inferred or hypotheses, never in
  the record section.
- **Code as evidence of its own intent.** "It checks for null to handle the null case"
  is mechanics. Motivation comes from an external source or is labeled inference.
- **Recency bias.** The current shape is often an accretion of earlier decisions; trace
  back past the last commit.
- **Skipping the gaps section.** A run that reports no gaps deserves suspicion.

## Reference files

- `references/epistemics.md`: confidence tiers, phrasing guide, calibration check.
- `references/code-archaeology.md`: git and `gh` search playbook.
