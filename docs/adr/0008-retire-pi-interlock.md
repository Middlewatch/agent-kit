# 0008: Retire pi-interlock; the owner gates carry the deletion guard

Date: 2026-09-25
Status: accepted

## Context

pi-interlock was a pre-execution seatbelt: deny credential-store access and
machine-level catastrophes, ask before boundary-crossing recursive deletes and
pushes to `main`, allow the rest, with a redacted audit trail. It ran in audit
mode for six weeks (42,909 tool calls over 43 active days) while the owner
decided whether to arm it. The log showed no catastrophic-category hit. The
shadow asks were scratchpad cleanup through shell variables the detector could
not resolve and pushes the owner had requested; the denies were deliberate
`~/.ssh` work. The owner's only standing concern is catastrophic deletion, and
on a single-user machine the credential category protects nothing he values.
The choices were to retire it, to leave it off, or to fix the false positives
and arm it.

## Decision

Retire the extension and its audit log. The owner gates in
`guidance/AGENTS.md` are the deletion guard.

## Consequences

The kit loses about 9,900 lines, an npm lockfile pinned to an old pi, and the
per-call and startup cost of the hook. Nothing in code now stops `rm -rf` on
a repo root, home, or `/`; the prompt-level gate has carried that for the
audit period and the log gave no reason to think it fails. If a code gate is
wanted again, the shape the evidence supports is a `tool_call` hook of a few
dozen lines that asks only when a recursive delete names `/`, home, or an
estate root, and nothing else: no credential category, no push category, no
audit trail. The retired extension's sources are in git history before this
ADR's commit.

## Considered options

- Leave it installed in `off` mode: no behavior, same maintenance burden.
- Fix the `$PI_SCRATCHPAD` false positives, downgrade credential deny to ask,
  and arm shield: real work for a category that fired zero times.
