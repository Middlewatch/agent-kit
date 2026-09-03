// Deep-mode orchestration template (Claude Code harness).
// Invoke via the Workflow tool with:
//   args = { question: string, subQuestions: string[], breadth: 'standard'|'exhaustive' }
// Adapt prompts if the topic demands it; keep the architecture (fresh-context researchers,
// independent refuters, findings returned to the orchestrator for synthesis).

export const meta = {
  name: 'deep-research',
  description: 'Fan-out researchers per sub-question, adversarially verify load-bearing claims, return verified findings',
  phases: [
    { title: 'Research', detail: 'one fresh-context researcher per sub-question' },
    { title: 'Verify', detail: 'independent refuters on load-bearing claims' },
  ],
}

// Defensive: some invocation paths deliver args as a JSON-encoded string.
const input = typeof args === 'string' ? JSON.parse(args) : args
const { question, subQuestions } = input
const breadth = input.breadth || input.tier || 'standard'
const VOTES = breadth === 'exhaustive' ? 3 : 1
const MAX_CLAIMS = breadth === 'exhaustive' ? 10 : 6

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'sourceUrl'],
        properties: {
          claim: { type: 'string', description: 'one specific, checkable claim' },
          sourceUrl: { type: 'string', description: 'URL the claim was actually read from' },
          sourceDate: { type: 'string', description: 'publication or last-updated date if known' },
          quote: { type: 'string', description: 'short verbatim supporting quote from the source' },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
    gaps: { type: 'array', items: { type: 'string' }, description: 'what you could not settle' },
  },
}

phase('Research')
const research = await parallel(subQuestions.map((sq, i) => () =>
  agent(
    `You are one researcher inside a deep-research fan-out. Main question: "${question}"\n` +
    `YOUR sub-question (research only this): "${sq}"\n\n` +
    `First load web tools: ToolSearch "select:WebSearch,WebFetch".\n` +
    `Loop: (1) run several searches with varied phrasings/synonyms — different framings surface ` +
    `different sources; (2) WebFetch the most promising results and READ them — the evidence is ` +
    `on the page, and primary sources (official docs, papers, standards, original reporting) ` +
    `outrank aggregators and SEO content; (3) notice what is still unsettled and search again. ` +
    `At least two search rounds.\n` +
    `Extract specific claims with the source URL you read each from, the source date, and a ` +
    `short verbatim quote — a field you did not actually read stays empty. Record real ` +
    `disagreements between sources as separate findings. Report what sources say, in their terms.`,
    { label: `research:${i + 1}`, phase: 'Research', schema: FINDINGS }
  )
))

const all = research.filter(Boolean).flatMap((r, i) =>
  r.findings.map(f => ({ ...f, subQuestion: subQuestions[i] })))
const gaps = research.filter(Boolean).flatMap(r => r.gaps || [])

// Barrier is intentional: claim selection needs the full cross-researcher picture.
const SELECTION = {
  type: 'object',
  required: ['loadBearing'],
  properties: {
    loadBearing: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'sourceUrl'],
        properties: { claim: { type: 'string' }, sourceUrl: { type: 'string' } },
      },
    },
  },
}
const selection = await agent(
  `Main question: "${question}". Findings from parallel researchers (JSON):\n` +
  JSON.stringify(all) +
  `\n\nSelect the at most ${MAX_CLAIMS} LOAD-BEARING claims — the ones the final answer stands ` +
  `on, where being wrong would change the conclusion. Prefer claims that are surprising, ` +
  `single-sourced, or decision-driving. Skip claims that are common knowledge.`,
  { label: 'select-claims', phase: 'Verify', schema: SELECTION }
)

phase('Verify')
const VERDICT = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    counterSourceUrl: { type: 'string' },
    independentConfirmationUrl: { type: 'string' },
  },
}
const verified = await parallel(selection.loadBearing.map(c => () =>
  parallel(Array.from({ length: VOTES }, (_, v) => () =>
    agent(
      `Adversarially verify this claim from a research report. Claim: "${c.claim}" ` +
      `(originally sourced from ${c.sourceUrl}).\n` +
      `First load web tools: ToolSearch "select:WebSearch,WebFetch".\n` +
      `Actively try to REFUTE it: search for the counter-case on purpose, using sources ` +
      `INDEPENDENT of the original (different site/author/org). Also note any independent ` +
      `confirmation you find. refuted=true if you find a credible contradiction OR if the claim ` +
      `has no support outside its original source and looks doubtful. Judge the claim, ` +
      `not its phrasing.`,
      { label: `refute:${v + 1}`, phase: 'Verify', schema: VERDICT }
    )
  )).then(votes => {
    const real = votes.filter(Boolean)
    const refutedVotes = real.filter(x => x.refuted)
    return {
      ...c,
      refuted: refutedVotes.length > real.length / 2,
      verifierNotes: real.map(x => x.reason),
      confirmations: real.map(x => x.independentConfirmationUrl).filter(Boolean),
      counters: real.map(x => x.counterSourceUrl).filter(Boolean),
    }
  })
))

// Synthesis stays with the orchestrator: it holds the user's framing and files the report.
return {
  findings: all,
  verified: verified.filter(Boolean),
  gaps,
  stats: {
    breadth,
    researchers: subQuestions.length,
    findings: all.length,
    claimsVerified: (selection.loadBearing || []).length,
    refuted: verified.filter(Boolean).filter(v => v.refuted).length,
    outputTokens: budget.spent(),
  },
}
