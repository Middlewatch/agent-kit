---
name: inbox-triage
description: " Use when the owner asks to triage, sweep, sort, or clear the inbox, and when bin/check reports notes past 30 days untriaged."
disable-model-invocation: true
---

# Inbox triage

Self explanatory: read `~/.agents/inbox` and triage every note. They either get promoted
to a home that gets read or deleted. The owner rules on each one.

## Outcome

An inbox empty of everything but `friction-` notes, one commit per note, and a wiki that still passes `bin/lint-wiki`. Notes
that were deleted stay in git history, so a wrong delete costs one `git show`.

## Defer to owner ruling

Every disposition goes through `ask_user_question`. Agents do not file into the wiki from
the inbox on their own, and do not delete a note on their own.

## Procedure

**1. Inventory.** List `~/.agents/inbox/*.md` (the README is not a note; `friction-`
prefixed notes are the introspect sweep's input — leave them for it) and read each
one in full. Past a dozen notes, summarize them into the scratchpad with a script and
read the summary.

**2. Screen for durability.** The test from `~/.agents/wiki/OKF_PROFILE.md`: (is this still true in six months
with nobody maintaining it?). Verified behavior, a research finding, or a decision with its
rationale passes. Current layout, deployment state, status, and task lists rot, and rot
in the wiki is worse than an empty wiki. Expect most of the stream to fail this; the raw
capture rate runs about ten percent durable.

**3. Propose a home.** Match the surviving notes against the destination map, and name a
specific file path. If the note does not fit in one of the below directories, then propose
creating a new one, don't try to force something to fit where it logically does not.

| the note holds | home |
|----------------|------|
| tool caveat, kernel behavior, library quirk | wiki `reference/` |
| a coding-language finding | `~/.agents/reference/coding-languages/<lang>/`, per the `harvest` skill |
| when to reach for an installed tool, or a trap it hides | `~/.agents/system-tools-index.md` |
| this machine's hardware, layout, or local services | `~/.agents/MACHINE.md` |
| research finding or topical knowledge | wiki `knowledge/` |
| harness, extension, or pi runtime behavior | wiki `platform/` |
| inference hardware, serving, model eval | wiki `infra/` |
| owner facts and preferences | wiki `personal/`, `privacy: local` |
| day-job domain knowledge | wiki `work/` |
| something one project owns | that repo's docs |

When a note restates or contradicts a note that already exists, the disposition is
amending that note, not adding a sibling for a later reader to reconcile.

**4. Rule.** Ask in batches of up to four notes per `ask_user_question` call, each note
one question: the claim in one line, then the options `Promote to <path>`, `Route to
<file>`, and `Delete`. Lead with your recommendation and say why in its description. The
owner's custom answer overrides any option you drafted.

**5. Execute.** For a promotion, rewrite the note into the destination's format rather
than moving the file: wiki notes take the four required frontmatter keys and stand alone
with no capture-time framing, and a routed fact becomes a line in its target file. Then
`git rm` the inbox note and commit the removal together with the landing, so history shows
one move rather than a delete and an unexplained addition.

## Verification

```bash
cd ~/.agents/wiki && python3 bin/lint-wiki && python3 bin/gen-indexes
~/.agents/kit/bin/check
```

`gen-indexes` rewrites the lane indexes from note frontmatter; commit its output with the
last triage commit. `bin/check` should no longer report the inbox advisory.

Report what landed where and what was deleted, with the note count. A note the owner
deferred stays in the inbox and is dealt with the next time the triage is invoked.
