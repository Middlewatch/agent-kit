---
name: as-built
description: "Doc cleanup, stale-state sweep, or publishability pass after a build wave lands."
disable-model-invocation: true
---

# As-built documentation pass

Agents narrate builds in scaffolding terms: slice and packet codes (S3, P2.5,
W1.9), plan references ("decision row 14", "after S1 lands"), lifecycle
statuses ("build pending", "post-MVP", "Status: building"). That shorthand is
useful while the plan is open and becomes dead weight after This pass rewrites
the living documentation to stand alone and match the system as it exists now.
An as-built document must be understandable and self-contained for an external
consumer or user of the product or package.

**The stand-alone test:** a doc is clean when it reads correctly months later
with no other document open. Phase numbers, plan-section references, packet
codes, and issue numbers are the signs it still depends on its build
scaffolding. Estate paths, hardcoded external paths, and other
development-specific links should be generalized: repo-relative or
$HOME-relative in prose, environment variables where code needs a knob.

**The pass is a truth-sync.** Docs written mid-build can carry deprecated
claims (deferral lists, placeholders, TBD items, "will be built"). Every
flagged claim gets verified against the current code/system, and stale comments
should be corrected for content or removed if they no longer add value. 

**Read the code.** Agents write sloppy comments and lazily define variables,
paths, and tests. The pass verifies code comments are also stripped of dates,
phase codes, and estate-specific references, and that machine-dependent
hardcoded paths and invariants are generalized. If the code will break when run
on another machine, or an external reader cannot understand it without access
to the development environment, flag it.

**Inline code editing.** While this skill is targeted towards prose updates it
is common to come across minor code errors that are quick to fix in the moment
and expensive for a future agent to re-derive. Comment, path, and doc-string
edits are in scope. A trivial, obvious one-line behavior fix (a typo'd string
constant, a dead import) may be made inline and reported after. Anything larger
may be fixed inline on at the agent's discretion based on apparent severity and
complexity. Report all findings both large and small upon completion of the
full as-built pass. 

**Read thoroughly.** While it may be tempting to skim, it is important to ingest
documents in a fashion that allows you to build a proper mental model of what
it should be describing holistically. This means that lazy file reads or
improper chunking of documents and code files will lead to a flawed picture and
you will miss obvious truth sync errors. This workflow requires thoroughness
for the output to be trustworthy. 

## 1. Classify the corpus

Inventory every doc (`find . -name "*.md"` or the project's equivalent), then
split into three classes:

- **Append-only ledgers**: changelogs, ADRs (`docs/adr/`), done specs
(`docs/specs/`),  build plans and execution logs, build trackers' history
sections, dated run logs. 
- **Living docs**: everything meant to describe the current system: README,
agent-instruction files (AGENTS.md/CLAUDE.md), specs, design docs, research
records, backlogs, provenance files.
- **Code**: when the project contains a codebase.

When a doc's class is ambiguous (a research report with a live "Status:"
header, a backlog with historical sections), split it. The record parts stay,
and the state parts sync. If genuinely unclear which class the user intends,
ask.

If the corpus is unusually large or contains a complex web of files, prefer
using delegated subagents for reviewing organized chunks of the corpus until
you have a clear picture of everything that exists. 

## 2. Sweep for scaffolding markers

Grep the living docs for the marker families, customized to the project's naming

Example script:

```bash
rg -n -e '\bS[0-9]{1,2}\b' -e '\bP[0-9]+\.[0-9x]+' -e '\bW[0-9]+\.[0-9]+' \
   -e '\bPhase [0-9]' -e 'decision row|plan decision|the approved plan|per the plan' \
   -e 'post-MVP|will be built|build pending|owed by|after S[0-9]|gates [A-Z0-9]|SCOPED' \
   -e '[Ss]tatus: (draft|building|pending|scoped|proposed)' -e '#[0-9]+\b' \
   --glob '!plans/**' --glob '!docs/adr/**' --glob '!**/CHANGELOG*'
```

Triage each hit.

- **Scaffolding (rewrite):** codes and references that resolve only through a finished
  spec or plan, such as slice codes cited outside the spec's own checklist ("S3 will add
  this"), packet IDs, plan decision rows, "the P1.5.5 client", and sequencing language
  ("after S1 lands", "parallel to P2.6"). A done spec still marked `Status: building` is
  a stale status, not a keep.
- **Stable references (keep):** citations of documents that still govern, such as a
  normative spec's section numbers (§5.9), a living design doc's path, or an external URL.
  These pass the stand-alone test already.
- **Historical entries inside a ledger section** of an otherwise-living doc (e.g. a
  changelog appendix): keep.

## 3. Verify current truth before rewriting

Build a checklist of every hit. Verify each against the artifact as it exists
now. When the checklist is long enough that the file-reading would crowd out
the rewriting, hand it to a read-only subagent. Otherwise verify inline. Each
claim comes back as one of:

- **true as written**
- **stale**: reality moved, no longer applicable or factually incorrect.
- **overtaken**: the doc's planned action already happened.

Instruction files get their operational claims checked at the source.

## 4. Rewrite by doc class

- **Design docs → as-built.** Status line becomes "as built (date)". Packet codes become
  the subsystem names the code actually has ("the permission engine", "the model client").
  Drafting deliberation ("X? No — Y, because…") becomes the decision stated directly with
  its reason. Problem/rationale sections keep their motivating history in plain past
  tense if that rationale is still contextually valuable. Deferral/"does not do"
  lists are re-checked item by item against step 3.
- **Living lists (backlogs, trackers) → re-baseline.** Graduated items compress to a stub
  pointing at the shipped artifact, resolved items move to a short "resolved since" note,
  and open items are restated to stand alone. 
- **Dated records (done specs, research reports, rulings, scope docs) → light touch.**
  For these files: fix the title/header to stand alone, update the status line to what actually happened, and leave the body as the historical record.
- **Instruction files (AGENTS.md/CLAUDE.md) → current operations.** Commands, test lanes,
  and workflow rules describe today's build system, verified in step 3. Workflow rules
  that only made sense inside the finished plan's process ("update packet status in the
  plan") are replaced by the standing convention, since these files are auto loaded by all agents working in the repo it is highly important that they are not contradictory and do not accidentally poison the context of future workers. 
- **Code → fix wave.** Apply the findings, and close the register

If you are not sure about how a section, code comment, descriptor or other item should be re-written a good rule of thumb is to prefer present tense and representing the information as if you are explaining how it works rather than tracing a historical record or hedging past rationale.

## 5. Verify and hand off

1. Re-run the step-2 sweep over the living docs, plus the code marker greps when a code
   review ran. Expect zero unresolved scaffolding hits (ledgers excluded), with the stable
   references that were kept listed in the report so the keep judgments are auditable.
   Show the result.
2. Run the project's verification if any exists (the gate script, doc validators, link
   linters). Show green.
3. Present the diff summary and leave the changes **uncommitted** for review.
4. Where the project's state is tracked outside the repo (wiki note, tracker), record
   that the doc baseline was reset and the convention now in force.
