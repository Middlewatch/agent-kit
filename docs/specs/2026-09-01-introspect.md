# introspect

Date: 2026-09-01   Status: built; S4 (first live sweep, owner-run) open

## Problem

The estate files knowledge well and refines it rarely. The first wiki usage
snapshot (2026-08-31) measured it: 13% of notes have received a substantive
edit after creation, 33 of 96 have never been referenced, and skills change
only when a failure happens to surface mid-session. No record ties a skill
revision to its motivation or its observed result, so each change is a guess
and no later revision learns from the last. WikiSkill (arXiv:2608.27454, filed
in the skill-lifecycle wiki note) identifies the two missing pieces as a
maintainer role that returns to accreted evidence and an impact ledger the
proposer reads before proposing.

## Outcome

The owner triggers one sweep session and it: produces proposals that each cite
evidence (episode IDs, touch counts, or a friction note); walks every proposal
to an owner ruling; applies accepted edits before the session ends; and leaves
ledger entries pairing each change with its motivation. The deciding test is
the first live sweep (S4): a sweep that emits an evidence-free proposal, ends
with accepted edits unapplied, or changes a skill without a ledger entry has
failed the spec.

## Non-goals

- **Autonomous improvement.** WikiSkill's gate is a validation score; ours is
  the owner. No proposal is applied without a ruling, and the sweep never
  fires model-invoked.
- **Charters and always-loaded guidance in sweep scope, for now.** The owner
  notes they are the same category WikiSkill optimizes — steering text — so
  this is an expansion path, not a rejection. Revisit after two sweeps (open
  question below).
- **Benchmark scoring of skills.** Journal evidence and owner judgment are the
  only outcome signals. Usage numbers are trend input, never per-artifact
  verdicts (the measurement-bias caveats in the scanner header govern).
- **Changing the deliberate-access model.** Low ambient wiki touch rates are
  the design working, not a problem the sweep fixes.

## Decisions

- **Names:** the skill is `introspect`; the scanner tool is `introspect-scan`
  (owner ruling, 2026-09-01).
- **Form:** a kit skill, owner-invoked, `disable-model-invocation: true`.
  Session shape follows inbox-triage: evidence packet, then proposal → ruling
  → apply, one at a time.
- **Scope:** skills and wiki notes. Proposal types: patch skill, create skill,
  retire skill, refine note, merge notes, retire note, promote note to skill.
- **Scanner:** a new kit tool (own directory, README, tests; deployed via
  `deployments.json`) that scans `~/.agents/journals` for skill invocations
  and wiki note touches — a superset of the wiki's `bin/usage-report` read
  side, carrying the same bias-caveat header. Dated snapshot output so months
  compare. Whether `usage-report` later thins to call it is left open.
- **Ledger:** per-skill `LEDGER.md` in each skill directory. Dated entries of
  motivation → change, appended at edit time by any session that changes the
  skill (skill-author and `skills/AUTHORING.md` gain this step); the sweep
  appends observed-outcome lines to prior entries. Wiki notes carry no
  ledgers; wiki-side rulings are recorded in the sweep's dated snapshot under
  `~/.agents/wiki/metrics/`.
- **Friction capture:** owner annoyances are inbox notes with a `friction-`
  filename prefix, one observation per file, written by the owner or by an
  agent told mid-session. inbox-triage skips them; the sweep consumes and
  archives them.
- **Application:** accepted edits apply in-session, under each artifact's own
  discipline (skill edits via skill-author, wiki edits via the wiki's lints).
  Retirements are owner-gated by the ruling itself.
- **Cadence:** owner-triggered, roughly monthly, alongside the wiki
  usage-report `--write` run. No scheduler.
- **Sampling:** the sweep reads a bounded sample of episodes per flagged
  artifact (scanner lists them; the skill caps reads per session hygiene —
  scripts and raw output to the scratchpad).

## Seams under test

- **The scanner CLI** is the tested seam: given a fixture journal tree and
  skill/wiki layout, its snapshot output is asserted line-level. Prior art:
  `tests/test_check.py` against the fixture kit.
- **The sweep skill** is prose; its gate is the S4 live sweep, not a suite.

## Slices

- [x] S1 Scanner tool: journal scan for skill invocations + wiki touches,
      dated snapshot, fixture-backed tests, wired into `deployments.json`.
- [x] S2 Ledger convention: `LEDGER.md` format documented in
      `skills/AUTHORING.md`, edit-time step added to skill-author, ledgers
      backfilled from git history for skills changed in the last two months.
      (after S1, so backfill can cite touch data)
- [x] S3 Sweep skill: the `introspect` skill itself, the `friction-` note
      convention, and the inbox-triage exemption. (after S2)
- [ ] S4 First live sweep, owner-run — the acceptance test. Outcomes recorded;
      later slices re-cut from what it teaches. (after S3)

## Open questions

- Charters and always-loaded guidance in sweep scope: owner leans toward
  eventually yes; decide after two sweeps have shown the session weight.
- Whether `wiki/bin/usage-report` thins to delegate its read side to the
  kit scanner once S1 exists.
