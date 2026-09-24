# Slopfix ledger

## 2026-09-23: preserve meaning and make heuristic checks advisory

- Motivation: the owner-approved review found conflicting fact-preservation and
  content-cut rules, compulsory rewrites overriding contextual preferences,
  reply-scope drift, workflow escalation, and CLI findings that could reward
  worse prose. Scratch cases reproduced code/comment leaks, sentence undercounts,
  and symbol/notation false positives despite the existing suite passing.
- Change: make the prose standard the document-style authority and AGENTS.md the
  reply-style authority. Bound the skill to meaning-preserving edits, remove
  workflow routing and extra approval gates, and replace compulsory rewrites with
  conditional examples. Make vocabulary, shape, emoji, and technical notation
  advisory; retain em-dash and curly-quote convention flags. Share inline
  exclusions, fix the reproduced boundary cases, document coverage and the exit
  status change, and add regression tests.
- Owner corrections on review: em dashes stay banned in every document with no
  literal exception; drafting rules 5 and 6 return to drafting form (the
  preservation boundary lives in SKILL.md); the standard applies to every
  agent-drafted document, including new ledger entries; the tool's threshold
  and lexicon rationale comments and the count-only report line return.
