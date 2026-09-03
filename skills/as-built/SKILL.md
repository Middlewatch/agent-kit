---
name: as-built
description: "Use when the user asks for an as-built pass, a doc cleanup, a stale-state sweep, a publishability sweep, or to establish a clean documentation baseline after a build wave lands."
disable-model-invocation: true
---

# As-built documentation pass

Agents narrate builds in scaffolding terms: slice and packet codes (S3, P2.5, W1.9), plan
references ("decision row 14", "after S1 lands"), lifecycle statuses ("build pending",
"post-MVP", "Status: building"). That shorthand is useful while the plan is open and
becomes dead weight after, since it makes every doc depend on documents that no longer
govern. This pass rewrites the living documentation to stand alone and match the system as
it exists now. An as-built document must be understandable and self-contained for an
external consumer or user of the product or package.

**The stand-alone test:** a doc is clean when it reads correctly months later with no
other document open. Phase numbers, plan-section references, packet codes, and issue
numbers are the signs it still depends on its build scaffolding. Estate paths, hardcoded
external paths, and other development-specific links are generalized: repo-relative or
$HOME-relative in prose, environment variables where code needs a knob.

**The pass is a truth-sync.** Docs written mid-build also carry claims that reality has
overtaken (deferral lists for features that since shipped, "will be built" for things
built). Every flagged claim gets verified against the current code/system, and stale ones
get corrected *content* rather than just corrected wording.

**Read the code.** Agents write sloppy comments and lazily define variables, paths, and
tests. The pass verifies code comments are also stripped of dates, phase codes, and
estate-specific references, and that machine-dependent hardcoded paths and invariants are
generalized. If code breaks when run on another machine, or an external reader cannot
understand it without access to the development environment, flag it for revision.

Comment, path, and doc-string edits are in scope. A trivial, obvious one-line behavior fix
(a typo'd string constant, a dead import) may be made inline and reported after. Anything
larger (bugs, failing code, spec nonconformance) is flagged and routed through the
appropriate workflow instead.

**Check the build state first.** When the tree looks mid-build (an open plan, failing
gates, a spec with unchecked slices), stop at a question and proceed only on the owner's
say-so. An as-built pass over unfinished work bakes in claims that the next slice will
falsify.

## 1. Classify the corpus

Inventory every doc (`find . -name "*.md"` or the project's equivalent), then
split into three classes:

- **Append-only ledgers**: changelogs, ADRs (`docs/adr/`, superseded rather than
  edited), done specs (`docs/specs/`, whose slice checklist is the record of what
  landed), legacy `plans/` build plans and execution logs, build trackers' history
  sections, dated run logs. These are history. They keep their scaffolding codes and
  stay byte-untouched. Their job is to record what happened in the terms of the time.
- **Living docs**: everything meant to describe the current system: README,
  agent-instruction files (AGENTS.md/CLAUDE.md), specs, design docs, research
  records, backlogs, provenance files.
- **Code**: when the project contains a codebase, delegate a fresh-context
  code reviewer to intake the codebase and sweep it for the same marker
  families in comments, paths, and test names.

When a doc's class is ambiguous (a research report with a live "Status:"
header, a backlog with historical sections), split it. The record parts stay,
and the state parts sync. If genuinely unclear which class the user intends, ask.

## 2. Sweep for scaffolding markers

Grep the living docs for the marker families, customized to the project's naming:

```bash
rg -n -e '\bS[0-9]{1,2}\b' -e '\bP[0-9]+\.[0-9x]+' -e '\bW[0-9]+\.[0-9]+' \
   -e '\bPhase [0-9]' -e 'decision row|plan decision|the approved plan|per the plan' \
   -e 'post-MVP|will be built|build pending|owed by|after S[0-9]|gates [A-Z0-9]|SCOPED' \
   -e '[Ss]tatus: (draft|building|pending|scoped|proposed)' -e '#[0-9]+\b' \
   --glob '!plans/**' --glob '!docs/adr/**' --glob '!**/CHANGELOG*'
```

Triage each hit. A reference is scaffolding only when its target stopped governing:

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

Build a checklist of every status, deferral, "not yet built", tense claim ("will be
copied"), and command/lane description the sweep touched. Verify each against the
artifact as it exists now: the code, the build system, the published document, the
physical thing. When the checklist is long enough that the file-reading
would crowd out the rewriting, hand it to a read-only subagent. Otherwise verify inline.
Each claim comes back as one of:

- **true as written**: rewrite wording only.
- **stale**: reality moved (feature shipped, item resolved, target renamed), so the
  rewrite states the current truth, with file-level evidence.
- **overtaken**: the doc's planned action already happened, so convert to past tense or
  drop.

Instruction files get their operational claims checked at the source: the actual
Makefile/test targets, the actual install paths, the actual flags.

## 4. Rewrite by doc class

- **Design docs → as-built.** Status line becomes "as built (date)". Packet codes become
  the subsystem names the code actually has ("the permission engine", "the model client").
  Drafting deliberation ("X? No — Y, because…") becomes the decision stated directly with
  its reason. Problem/rationale sections keep their motivating history in plain past
  tense, since the *why* is the most valuable content in the file. Deferral/"does not do"
  lists are re-checked item by item against step 3.
- **Living lists (backlogs, trackers) → re-baseline.** Graduated items compress to a stub
  pointing at the shipped artifact, resolved items move to a short "resolved since" note,
  and open items are restated to stand alone. State transitions stay visible ("GRADUATED
  <date>"), because a backlog entry that silently vanishes reads as lost rather than done.
- **Dated records (done specs, research reports, rulings, scope docs) → light touch.**
  These are close to ledgers. Fix the title/header to stand alone, update the status line to what actually
  happened ("BUILT AND SHIPPED, see <repo>"), and leave the body as the historical record
  it is.
- **Instruction files (AGENTS.md/CLAUDE.md) → current operations.** Commands, test lanes,
  and workflow rules describe today's build system, verified in step 3. Workflow rules
  that only made sense inside the finished plan's process ("update packet status in the
  plan") are replaced by the standing convention.
- **Code (from the delegated review) → fix wave.** Apply the reviewer's findings, and the
  same reviewer closes the register. Comments state current behavior with no dates or
  phase codes, and machine-dependent paths are generalized.
- **Tense and provenance.** "Will be X by P2.5" → "is X", pointing at where the thing now
  lives.

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

Preparing a public-release export (filtered tree, orphan first commit, secret/license/CI
checks, clean-room proof) is the `public-release` skill, entered only on the owner's
explicit call. A completed as-built pass is its precondition.
