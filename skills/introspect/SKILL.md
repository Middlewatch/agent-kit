---
name: introspect
description: "Run the periodic outcome-review sweep over the estate's steering artifacts: skills and wiki notes. Use when the owner invokes introspect, asks for the monthly sweep, an outcome review, or a skill/wiki health pass. Not for triaging ordinary inbox notes (inbox-triage) or authoring a single skill on request (skill-author)."
disable-model-invocation: true
---

# Introspect

One sweep session turns a month of usage evidence and owner friction into ruled-on
changes to skills and wiki notes, and records each change's motivation so the next sweep
can check its outcome. The design is
`~/.agents/kit/docs/specs/2026-09-01-introspect.md`; ledger doctrine is the ledger
section of `~/.agents/skills/AUTHORING.md`.

## Outcome and boundaries

Every proposal cites its evidence (episode IDs, touch counts, or a friction note);
every proposal reaches an owner ruling; accepted edits are applied before the session
ends; skill changes get ledger entries and wiki-side rulings land in the dated snapshot.
The owner rules on every proposal; nothing is applied, retired, or archived on the
agent's own judgment. Usage numbers are trend signal, never per-artifact verdicts (the
bias notes in the scanner's README govern).

## Preconditions

`introspect-scan` on PATH (kit tool) and the wiki checkout at `~/.agents/wiki`. A sweep
with no friction notes and no prior ledger entries to close still runs; it just leans
entirely on the scan.

## Procedure

**1. Evidence packet.** Run `introspect-scan --write` and
`~/.agents/wiki/bin/usage-report --write`, and diff against the previous month's
snapshots in `~/.agents/wiki/metrics/`. Read every `friction-*.md` in
`~/.agents/inbox`. Bulk analysis goes through scratchpad scripts; the session reads
summaries.

**2. Close the last loop.** Find ledger entries missing an outcome
(`grep -rL 'Outcome' ~/.agents/skills/*/LEDGER.md` is a start; entry-level gaps need a
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

**6. Verify and report.** `cd ~/.agents/wiki && python3 bin/lint-wiki && python3
bin/gen-indexes`; `~/.agents/kit/bin/check --lint` if kit files changed. Report in
chat: proposals ruled, edits landed, outcomes closed, and what was deferred.

## Blockers

- A month with thin evidence produces a short sweep, not padded proposals. Say so and
  stop.
- Retiring a skill or note is executed only on an explicit ruling naming it, never
  bundled into a batch ruling.
- Scope today is skills and wiki notes; charters and always-loaded guidance join only
  by owner decision (open question in the spec).
