---
name: structural-review
description: "Review code for structure against the structural standard. Use when the owner asks whether the code makes sense, reads well, is well organized or structured, whether the names are right, whether something can be simplified, or asks for a cleanup, readability, or maintainability pass."
disable-model-invocation: true
---

# Structural review

You are reviewing how code is built and how it is read. The standard you diff against is
`references/structural-standard.md`. Read it before opening the codebase.

A run has two passes.

- **Map**: answers the whole-tree question ("can someone walk this codebase and understand
  what is happening?") and produces the module and ownership picture.
- **Drill**: takes one bounded region deep through the six axes. The drill is targeted and
  will surface most findings.

## Seams

- Record any structural finding that is a true product defect in "Observed, out
  of axis" and say it wants a `deep-review` pass. You do not own the fix.
- Any disagreement between the code and its spec, README, or an accepted ADR
  is a finding here: name the document and line.
- Stale phase codes and build-time language in docs and comments are `as-built`
  revisions.

## Preconditions

- **Language packs.** If `~/.agents/reference/coding-languages/<lang>/` exists, read its
  `CONVENTIONS.md`.
- **Project conventions.** Read the project's `AGENTS.md` and, if present, `DESIGN.md`,
  `ADR's` `SPEC.md` or other reference/design related documentation.

## 1. Map pass

Cover the whole tree cheaply. Write a script to the scratchpad that collects the shape,
run it, and read its summary. This should include: file tree by directory, line counts per
file, and the import or include edges between modules. Keep the script and its full output
on disk so the detail is one re-read away, and spot-check against the source before
trusting the aggregation.

From that summary plus targeted reads of module entry points, produce:

**The module table**: one row per module, listing what data it owns, what it depends on,
the size of its public surface, and whether ownership is clear or muddy.

**The dependency direction**: is it acyclic, and does it point the way the project says it
does? Name every cycle. A cycle is a default finding (a boundary drawn in the wrong
place), but its entry still states the recurring cost like any other.

**The walkthrough trace**: pick a real feature a user would name, and trace it from entry
point to completion. Record the hop count and every moment you had to search rather than
follow a reference. Each search is a place the structure failed to carry a reader. Write
the trace into the report as a numbered list of hops. It is the evidence for axis 5, and a
run without it has not answered the owner's question.

**The drill shortlist**: rank two or three candidate regions by where the map suggests
structure is weakest, such as ownership muddle, cycles, outsized files, directories that
do not map to concepts, and the places the walkthrough stalled.

If the owner named a region, drill there. Otherwise take the top of the shortlist, say
plainly why you chose it, and proceed without stopping to ask.

## 2. Drill pass

Read the chosen region properly, meaning whole files rather than windows.

Work the six axes from the standard in order.

On the ownership and legibility axes, apply the depth lens. A module is deep when a lot of
behavior sits behind a small interface, shallow when the interface is nearly as complex as
the implementation, and the interface here means everything a caller must know: signature,
invariants, ordering, error modes, configuration. Three checks make this concrete:

- **The deletion test.** Imagine deleting the suspect module. Complexity vanishing means
  it was a pass-through; complexity reappearing across N callers means it earned its keep.
  A confirmed pass-through is a finding whose cost is the indirection every reader pays.
- **The interface is the test surface.** Tests that reach past a module's interface to
  verify internals are evidence the module is the wrong shape, and the finding is about
  the module, not the tests.
- **One adapter is a hypothetical seam; two are a real one.** An abstraction with a single
  implementation and no second one in sight is speculative generality, already a deletion
  under the standard; name it as such.

Prefer proposing one deepened module over extracting helpers. Pure functions pulled out
purely for testability scatter the logic (no locality) while the bugs stay in how they are
called.

For the data axis, check the gate before writing anything. Is there a profiled hot path, a
plainly per-item path at large N, or a stated performance budget? If not, the axis
produces one line ("no evidence gate opened; layout not reviewed") and you move on.
Reaching for layout critique on cold code is how this skill would become noise, and the
gate is what prevents it.

- **Boring files are where the finding hides.** Glue, config, and re-export files are the
  ones everyone skims, which is why the naming drift and the ownership leak live there.
- **Write down what you considered and dropped.** A dismissal with no reason is drift
  rather than a decision, and writing the reason is what makes a weak reason visible.

## 3. Consolidate

Before proposing anything, collapse the candidate list. Thirty instances of one problem
are one finding about a module, carrying three representative examples and a count.

Then rank by cost:

- **MAJOR**: a caller misuses it today (cite the call site), or a measured budget is
  breached.
- **MINOR**: a likely change is made expensive, or a reader draws a specific wrong
  inference you can name.
- **NOTE**: a true structural observation, the one category explicitly exempted from the
  demonstrated-cost bar. It is recorded as an observation rather than queued as work.

Drop anything that survives to this point without a cost, unless it earns a NOTE under
that category's exemption.

## 4. Propose

Every finding carries a concrete before/after block the owner can rule on by number.

- Show the smallest diff that carries the change, meaning the changed signature and one
  call site rather than the whole file.
- For a consolidated finding, show one worked example and state the count and the
  mechanical rule for the rest ("same rename across 11 call sites").
- Where the change is a judgment call rather than a mechanical one (a boundary move, a
  type redesign, a layout change trading legibility for throughput, or a challenge to the
  project's own dominant pattern), mark it **YOUR CALL** and give the trade-off in one
  sentence rather than a diff. These are the owner's to decide.
- An idiom challenge is always **YOUR CALL** and is never approvable by number, because
  its remedy is a migration. Give the site count with it.

Then stop and present. Edit product code only after the owner rules.

## 5. Apply on approval

The owner replies with numbers, or "apply all", or a subset. Then:

- Apply exactly what they approved, and nothing adjacent that looked tempting.
- Run the project's gate script after applying. A structural change that breaks a gate
  gets reverted and reported rather than patched over.
- Renames are the risky mechanical case, so check every call site, including strings,
  docs, and tests, and say how many you touched.
- Report what was applied, what was skipped, and the gate result.

If a finding turns out to be wrong once you open the file to edit it, say so and drop it.
Discovering a false positive at apply time is a good catch.

## Output

Write to `.local/artifacts/structure-<YYYY-MM-DD>-<slug>/REPORT.md` in the project, per
`~/.agents/kit/skills/project-scaffold/references/project-layout.md`. Keep the map script and its raw output beside the report.

```markdown
# Structural review: <project> / <region>

**Baseline**: `<commit>` · gate: <pass/fail counts | none>
**Map**: whole tree · **Drill**: <paths>
**Standard**: structural-standard.md · packs read: <lang, or none>
**Date**: <YYYY-MM-DD>

## Walkthrough

Feature traced: <name> (<N> hops, <M> searches).

1. `entry.ext:12` → ...
   ...

**Verdict**: <can a stranger follow this tree, and where does it lose them>

## Module map

| Module | Owns | Depends on | Public surface | Ownership |
|---|---|---|---|---|

Cycles: <none | list>

## Findings

### [S-01] <one-line claim>  ·  <MAJOR|MINOR|NOTE>  ·  <axis>
- **Where**: `path/to/file.ext:120-134` <(+N similar, see count)>
- **Cost**: <who pays and when, citing the call site if someone already paid>
- **Before / After**:
  ```
  - fn procData(b: []u8) !Row
  + fn parseRow(bytes: []u8) !Row
  ```
- **Applies to**: <1 site | this rename across 11 call sites>

## Judgment calls: YOUR CALL

| # | Change | Scope | Trade-off |
|---|---|---|---|

## Considered and dropped

| Candidate | Why it is not a finding |
|---|---|

## Observed, out of axis

- <one line each: defects for deep-review, basis drift, doc staleness>

```

## Report back in product terms

Close with what the review means for the product: whether someone new could work in this
codebase today, which one change would most improve that, what the ownership picture looks
like now that it exists in one place, and what you deliberately left alone. Name the
single most important thing first, and give the owner the numbered list to rule on rather
than a summary of your process.
