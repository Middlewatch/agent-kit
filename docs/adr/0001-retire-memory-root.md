# 0001: Retire the memory root; journals, wiki, and inbox become their own locations

Date: 2026-08-22
Status: accepted

## Context

`~/.agents/memory` bundled three surfaces with different owners and lifetimes:
autojournal's raw session capture (`journals/`), an agent-curated wiki, and a
capture inbox. A usage audit found the wiki's browse retrieval largely unused
while ranked journal retrieval served session recall, yet its deliverable-store
and corrected-record functions were real; agent-only curation left it without a
reader. Autojournal is a public tool, and its surface should not include the
estate's knowledge base.

## Decision

Retire the `memory` binding. Autojournal owns `~/.agents/journals` (untracked,
machine-local). The wiki becomes a PKM curated by owner and agents together,
bound at `~/.agents/wiki` (the former memory repo re-rooted). The capture inbox
stays a tracked directory inside the wiki repo, bound at `~/.agents/inbox`, and
is the default drop for anything without an assigned home. Inbox triage is
interactive: a dedicated skill walks dispositions with the owner, and agents do
not file into the wiki autonomously outside research-report filing.

## Consequences

Guidance names three locations instead of one; autojournal stays self-contained
and uncoupled from the knowledge base. Wiki value now depends on the owner
staying in the triage loop; the kit's inbox staleness warning is the trigger.
Triage commits are atomic (a note leaves `inbox/` and lands in the wiki in one
commit). Every doc that cited `~/.agents/memory/...` owes a path update.

## Considered options

Folding the wiki into ranked retrieval (rejected: extends a public tool's
surface with estate content). Shrinking the wiki to a research-report store
(rejected: deletes the curated tier instead of giving it a reader).
