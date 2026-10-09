---
name: introspect
description: "Periodic outcome review over the estate's skills and wiki notes. Owner-invoked. Not for inbox triage or authoring one skill."
disable-model-invocation: true
---

# Introspect

One sweep session turns a month of usage evidence and owner friction into ruled-on
changes to skills and wiki notes, and records each change's motivation so the next sweep
can check its outcome. The design is
`~/agent-kit/docs/specs/2026-09-01-introspect.md`; ledger doctrine is the ledger
section of `~/agent-kit/skills/AUTHORING.md`.

## Outcome and boundaries

Every proposal cites its evidence (episode IDs, touch counts, or a friction note);
every proposal reaches an owner ruling; accepted edits are applied before the session
ends; skill changes get ledger entries and wiki-side rulings land in the dated snapshot.
The owner rules on every proposal; nothing is applied, retired, or archived on the
agent's own judgment. Read usage numbers as trend signal; the bias notes in the
scanner's README govern how far a single artifact's count can be trusted.

## Preconditions

`introspect-scan` on PATH (kit tool) and the wiki checkout at `~/agent-kit/wiki`. A sweep
with no friction notes and no prior ledger entries to close still runs; it just leans
entirely on the scan.

## Procedure

**1. Evidence packet.** Run `introspect-scan --write` and
`~/agent-kit/wiki/bin/usage-report --write`, and diff against the previous month's
snapshots in `~/agent-kit/wiki/metrics/`. Read every `friction-*.md` in
`~/agent-kit/inbox`. Bulk analysis goes through scratchpad scripts; the session reads
summaries.

**2. Close the last loop.** Find ledger entries missing an outcome
(`grep -rL 'Outcome' ~/agent-kit/skills/*/LEDGER.md` is a start; entry-level gaps need a
read). For each, check what this month's evidence says and append the
`- Outcome (YYYY-MM-DD sweep): ...` line; "no evidence either way" is a valid
outcome when true. This happens before new proposals so the sweep learns from its last round.

**3. Build proposals.** From the packet: friction notes first, then cold/never-invoked
artifacts, then hot artifacts showing strain. Sample the episodes behind a count with
`introspect-scan --episodes <artifact>` and read at most a couple per flagged artifact.
Proposal types: patch, create, or retire a skill; refine, merge, retire, or
promote-to-skill a wiki note. A proposal without evidence does not get made.

**4. Rule.** Batches of up to four per `ask_user_question` call, one proposal per
question: the claim and its evidence in one line, options with the recommendation
first. Deferral is a valid ruling and carries to the next sweep.

**5. Execute accepted proposals.** Skill edits follow skill-author (including its
ledger hand-off step); wiki edits follow the wiki's own lints and index generation;
consumed friction notes are `git rm`'d with the change they motivated so history shows
the pairing. Append a `## rulings` section to this month's
`metrics/introspect/<date>.txt` recording every proposal, its ruling, and rejected
proposals' reasons, then commit the wiki.

**6. Verify and report.** `cd ~/agent-kit/wiki && python3 bin/lint-wiki && python3
bin/gen-indexes`; `~/agent-kit/bin/check --lint` if kit files changed. Report in
chat: proposals ruled, edits landed, outcomes closed, and what was deferred.

## Blockers

- A month with thin evidence produces a short sweep, not padded proposals. Say so and
  stop.
- Retiring a skill or note is executed only on an explicit ruling that names it; a
  batch ruling does not cover retirement.
- Scope today is skills and wiki notes; always-loaded guidance joins by owner decision
  (open question in the spec).
