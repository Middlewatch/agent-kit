---
name: data-model
description: "Settle and maintain the project's core data structures in docs/DATA_MODEL.md. Use after a feature-map session, before the first spec that adds state, when a build slice needs a structure the doc lacks or strains one it has, or when the owner asks what the data should look like. Not for one-off local types, or for recording a single decision (adr)."
---

# Data model

This skill and the document it generates is where the agent and the owner agree on what
the core structures are, who writes each one, how it is read, and where it crosses a
boundary, so that a build session designs toward the finished product's data instead of
the current slice's convenience. Rows in `docs/FEATURE_MAP.md` name entries here; entries
here name the rows they serve.

The session is also how the owner learns the architecture. Every shape put to the owner
carries what it makes cheap, what it makes expensive, and why the alternative lost, so the
owner can read their own codebase later and know why each structure is the way it is.
Thoroughness is the point; a quick session that picks defaults the owner does not
understand has failed even when the defaults are right.

Read `principles/model-the-domain.md` and `principles/type-system-discipline.md` under
`~/.agents/skills/evoker-mode/` before drafting an entry, the project language's
`CONVENTIONS.md` under `~/.agents/reference/coding-languages/` when one exists, and
`references/shape-tradeoffs.md` in this skill before putting any choice to the owner.

## Outcome and boundaries

Success is `docs/DATA_MODEL.md` with one entry per core structure, each with a status,
the owner having ruled on or knowingly delegated the entries marked as their call, one
independent review closed, committed, and the feature map's `?` data cells replaced with
entry names. The skill writes no product code and no specs. A structure that stays local
to one package and one feature stays in code and gets no entry.

On a greenfield project the doc is also the contract that stops a builder from
under-building: an entry describes the finished structure, so a slice that hardcodes
what the entry says is a registry, a picker, or a variant is a finding, not a shortcut.

## Entry format

```markdown
## <Structure>

Status: provisional | settled | built (`internal/store/artifact.go: Artifact`)
Owner: the one actor that writes it
Lifetime: created when, dies when, persisted where
Read by: dominant access patterns, hot path first
Boundary: where bytes become this type (the parse function) and where it becomes bytes
Serves: feature-map rows, intended ones included

```go
type Artifact struct {
    Seq      uint64
    ID       ArtifactID
    At       time.Time
    Payload  Payload // exactly one variant
}
```

Why this shape: one to three lines naming the access pattern that decided it and the
alternative it beat.
```

Rules:

- **Sketch in the project language.** A sketch catches field-level mistakes that a
  table hides. It is a sketch: no methods, no tags, no doc comments.
- **Built entries point, they do not repeat.** When the structure lands in code, replace
  the code block with the path and type name. Owner, Lifetime, Read by, Boundary, and
  Why stay in prose, since the code does not carry them.
- **One owner per structure.** Two writers is a design finding, per
  `separate-before-serializing-shared-state`; resolve it before the entry is `settled`.
- **Sum types for variants, not optional-field bags.** A field valid only in some states
  is a variant waiting to be named.
- **Derived facts are not stored.** A flag that must agree with another field (dirty
  beside a history pointer) is computed from the field it would shadow.
- **Boundaries are named functions.** External bytes (wire, file, CLI, env) become the
  type in exactly one parse function per boundary; the entry names it, even before it
  exists. One persisted file, one type.
- **Saved and live shapes share one tree.** When a structure is persisted with
  references replaced (paths for ids), make the type generic over the reference rather
  than writing a second structure that can drift.
- **Names come from `CONTEXT.md`.** A structure named here that the glossary lacks goes
  there in the same session.

## Procedure: settling

1. **Read.** The feature map, existing entries, and for a project with code, the types
   that already exist at package, actor, and serialization boundaries (delegate an
   explore child to list them with their writers). Those become `built` entries first
   so the owner sees what is already committed to. Find where any schema the map
   mentions already lives before asking the owner about it.

2. **Inventory.** From the feature map's Data column, list candidate structures.
   Collapse synonyms through the glossary. For each, gather the access patterns from
   every row that touches it, intended rows included; an intended row's read pattern is
   as real as a shipped row's. Say which candidates get an entry and which stay local,
   and why.

3. **Sketch competing shapes** for anything contested: two or three, each with the
   access pattern it favors and the one it punishes. Ask of each: what is read together,
   what is hot, who owns it, what crosses a boundary, and what combination of values
   must never exist. When an observable fact decides it (size, speed, layout), run the
   Prototype playbook and let the result rule.

4. **Interview until settled.** This is a long-form conversation with no question cap.
   Work through one structure at a time. For each choice that is the owner's
   (ownership, lifetime, persistence, any boundary that is hard to move later), present
   the options with the sketch as the preview and, inside each option's description,
   two lines: what gets cheap, what gets expensive. Put every term the owner may not
   know (a format, a data structure name) inside the option description, since text
   outside the question box may not be seen. When the owner says they cannot judge,
   explain the trade-off in prose with an example from a product they know, then ask
   again; when they decline to rule, the agent picks, marks the entry `provisional`,
   and lists the pick in the report as a decision the owner can veto. A choice that
   qualifies for an ADR gets one now.

5. **Write and review.** Write the entries with their status, update the feature map's
   Data cells, add glossary terms. Then delegate one fresh-context review of the doc
   (review profile) asking for: two writers, invalid states a sketch admits, fields that
   must stay in sync, structures referenced but not defined, saved shapes carrying live
   state, and map cells naming entries that do not exist. Fix, re-review the fix wave,
   and only then commit. Bring findings that are the owner's to them as options, not as
   fixes already made.

6. **Report.** For each entry: status, who ruled, and the trade-off that decided it, so
   the owner has the reasoning in one place.

## Procedure: maintaining

- **Build reads it at orient.** A slice whose structure has an entry builds to that
  entry, whole. A slice that needs a field the sketch lacks adds it to the sketch when
  the addition is reversible and says so in the commit message.
- **A change to Owner, Lifetime, or Boundary is a stop.** Redesign the entry as if the
  new requirement had been there from day one (`redesign-from-first-principles`), put
  the new sketch to the owner, then continue.
- **Strain tells.** A second boolean that must stay in sync with the first; a new
  optional field valid only sometimes; a branch on a kind field spreading across files;
  a second writer. Any of these on a `settled` or `built` entry reopens it.
- **Built entries move with the code.** A commit that changes a built structure's shape
  re-checks the entry's prose lines in the same commit.
- **Doc size.** Entries exist for structures that cross a package, actor, or
  serialization boundary, or that several features share. When an entry stops meeting
  that bar, delete it.

## Sizing

- One new field on a built structure: edit code and the entry's prose, no session.
- One new structure for one feature: a session scoped to that entry, steps 2 to 5.
- A new project or a project with real code and no doc: a full settling session,
  built entries derived first. On a greenfield project expect the first spec to reopen
  entries; that is the doc working, not failing.
