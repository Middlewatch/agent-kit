---
name: feature-map
description: "Chart and maintain the project's feature map at docs/FEATURE_MAP.md through a long-form interview with the owner. Use before the first spec of a new project, when the owner brings a new idea or pivot, when an effort is too foggy for one spec conversation, and when a spec or build session finds the map silent on the area it touches. Not for invariants (DESIGN.md), complaints (INTAKE.md), or slicing one effort (spec)."
---

# Feature map

The map transfers product intent. An agent designing a store, a type, or a package
boundary reads the rows for that area, including the ones not built yet, and shapes the
work toward the finished product instead of the current slice. Intent lives here;
invariants live in the design basis, open complaints in the intake file, and the settled
shapes of the data in `docs/DATA_MODEL.md` (the `data-model` skill).

The map is built by interview. The owner will not know every feature that is an option,
so the agent brings the baseline for the product kind and the owner brings the wants and
the grievances; the map is what survives the back-and-forth.

## Outcome and boundaries

Success is `docs/FEATURE_MAP.md` the owner has read and confirmed, committed, with every
open item typed, every feature naming the data it touches or `?`, and a non-goals list the
owner wrote in their own words. The skill writes no specs, slices, ADRs, or code; a
decision that qualifies for an ADR routes to the `adr` skill in the moment, and the map
links it.

## Format

```markdown
# <Project> feature map

Updated: YYYY-MM-DD

## The product
Two to four sentences: who uses it, what they get, what it refuses to be.

## Non-goals
One line each, in the owner's words, with the reason. This list stops the map growing in
the wrong direction; an item leaves it only when the owner redraws the product.

## <Area>
Intent: what the user has in this area when it is done. One or two sentences.
Why: the grievance or want this area exists to answer. One line.

| Feature | Status | Data | Notes |
|---|---|---|---|
| Resume a session by name | shipped | Session, Manifest | |
| Fold a span and recall it | building | Fold, Artifact | docs/specs/2026-08-21-fold.md |
| Per-tool cost in the dashboard | intended | Usage, ToolCall | needs Usage per call, not per turn |
| Which fold policies ship by default | open: grilling | Fold | after "extension hook order" |
| Remote check-in | rejected | | owner ruling 2026-08-15: the user's own tunnel |

## <Area> (unmapped)
Intent only, as loosely as the current view allows. No rows yet.
```

Rules that make it a map and not a document:

- **A row is one line.** Detail lives in the spec, ADR, or data-model entry the Notes
  column links. A row that needs a paragraph is an area heading in disguise.
- **A row describes the finished behavior.** "Flip between recent projects" means a
  picker over remembered projects, not a hardcoded directory. Builders read rows as the
  whole feature; a row that would be acceptable half-built is written too vaguely.
- **Status vocabulary is fixed:** `shipped`, `building` (Notes links the spec),
  `intended`, `open: research | prototype | grilling | task` (Notes names what it waits
  on, `after <row>` when blocked), `rejected` (Notes names the ruling). A rejected row
  stays so the idea is not re-proposed from scratch.
- **Data names entries in `docs/DATA_MODEL.md`.** `?` is honest and is the prompt for a
  `data-model` session. A feature whose data is `?` is not ready to spec.
- **Features, not mechanisms.** "Long sessions stay cheap" is a feature; "fold layer" is
  the mechanism that serves it and belongs in the Data or Notes column. The test: would
  the user say it that way.
- **Area cuts follow the user's view,** not the package tree. When a package serves
  several areas, it appears in several rows.
- **Names come from `CONTEXT.md`** where one exists; a new term settled here goes there
  in the same session (the `glossary` skill).

## Procedure: charting

1. **Read.** README, the design basis, `CONTEXT.md`, `docs/specs/`, `docs/adr/`, the
   intake file, and the package list. For a project with code, derive the `shipped` rows
   from what runs (delegate an explore child for breadth) so the owner confirms instead
   of dictating. For a new project the map is the first artifact and the README thesis
   is drafted beside it. When the owner says to chart fresh, leave prior projects and
   journals out; when they do not, search memory once so settled rulings are not
   re-asked.

2. **Hand the owner the form, then wait.** Paste `assets/interview-form.md` into the
   reply and ask the owner to fill in what they can and skip the rest. Propose no areas
   and no rows until the form comes back; an area cut proposed before the dump anchors
   the owner to the agent's view.

3. **Reflect.** Turn the dump into candidate areas and rows, and offer two or three
   competing area cuts when the space could be sliced differently; the owner picks. Name
   the data each row implies as you go. Push back on mechanisms wearing feature
   clothing and on rows that duplicate an existing one under a new word. Write the
   `Why` line for each area from the owner's grievance, and draft the non-goals list from
   what they said they do not want.

4. **Walk the baseline.** Read `references/baseline-checklist.md`, pick the product
   kind, and bring every item the dump did not cover to the owner in prose, a few at a
   time, with one sentence on what the item means and what the industry default is. The
   owner rules each in (a row), out (non-goals), or open (a typed open row). Items the
   owner cannot picture yet get a short explanation and an example product that has it
   before they rule. This is where the map grows past what the owner knew to ask for.

5. **Interview until settled.** This is a long-form conversation, not a form with a cap.
   Keep going while any row's status, area, or data is unclear, and use
   `ask_user_question` only for rulings that have discrete options: maturity per row,
   boundaries between areas, rejections. Put any term or trade-off the owner may not
   know inside the option description, since text outside the question box may not be
   seen. Anything the owner cannot settle now becomes an `open` row with a type; do not
   fill it in for them.

6. **Write, review, commit.** Write the map plus any glossary terms and ADRs that fell
   out. Delegate one fresh-context review of the map against the baseline checklist and
   the rules above; bring the findings to the owner as rows to rule on, fix, and commit.

7. **Hand off.** Rows with `?` data or new structures: the `data-model` skill. A settled
   region big enough to build: the `spec` skill. Open rows: one resolved per session,
   research to delegate children or `deep-research`, prototypes to the Prototype
   playbook, grilling to the owner, tasks directly or via `wizard`.

## Procedure: maintaining

- **Update inline, not batched.** The moment an idea, ruling, or rejection lands in any
  session, edit the row then. An idea deferred to a cleanup pass is an idea lost.
- **Status moves with the work.** A spec written moves its rows to `building`; its last
  slice ticked moves them to `shipped`; a resolved open row becomes `intended` or
  `rejected` and its answer lands where the detail belongs.
- **Read at orient.** `spec` reads the area's rows in its first step and `build` reads
  them before the first edit, intended rows included, and builds each row whole. A
  design choice that would make an intended row expensive is a finding to raise in chat,
  not a reason to widen the slice or stub the row.
- **Challenge drift.** When the owner describes a feature against its recorded row or a
  non-goal, say so and let them rule. When the code contradicts a `shipped` row, surface
  it rather than editing the row to match the wish.
- **Refresh the date** on every edit; the map is trusted over recollection across
  sessions.

## Sizing

- A single small change with an obvious home in an existing row: edit the row, no
  session.
- A new area or a pivot: a charting session for that area only, steps 2 through 6.
- A project with no map and real code: one charting session, shipped rows derived first.
