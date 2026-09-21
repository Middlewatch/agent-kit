---
name: data-model
description: "Map or settle a codebase's core data structures: real declarations carrying an ownership record, indexed in docs/DATA_MODEL.md. Use when starting a project, reading an unfamiliar codebase, or preparing to patch a third-party fork. Not for local types or a single decision (adr)."
disable-model-invocation: true
---

# Data model

Find or settle the handful of structures a program is built around, and record for each
one who writes it, how long it lives, what it points at, and where it crosses a boundary.
The code is the model: declarations compile, the record sits on the type, and
`docs/DATA_MODEL.md` is an index short enough to read in one sitting. The owner reads the
index and the records to follow a codebase as it grows, so write every line for a reader
who has not seen the code.

## Outcome and boundaries

Success is `docs/DATA_MODEL.md` with one index row per core structure, every pointer in it
resolving to a real declaration, each mapped structure carrying its record, the project
build passing, one independent review closed, and the work committed on a branch.

A core structure crosses a package, actor, or serialization boundary, or several features
share it. A type local to one package and one feature stays out. Index every structure in
scope that qualifies, and write records for about 15 per session, the ones the scope needs
most. The rest get a row with status `unmapped` and wait for a session scoped to their
subsystem. Implementations of one interface share the interface's row, named in its first
line, until a session needs one of them.

The skill writes declarations, signatures with stub bodies, comments, and the doc. Defects
met in existing code (a second writer, a flag that can drift) go to the report as findings
for the owner to rule on.

Where the record lives depends on who owns the code:

| Situation | Declarations | Record |
|---|---|---|
| New project | written now, in a model file per package (`types.go`, `model.zig`, a header) | comment on the type |
| Existing code the owner controls | already exist | comment added above the type, nothing else changed |
| Third-party code or a fork | already exist; upstream files stay byte-identical so rebases stay clean | full entry in the doc |

## The record

```go
// Artifact is one record in a session log.
// Owner: the session actor; turns append through store.Log and nothing else writes.
// Lifetime: appended once, never rewritten; dies with the session file.
// Holds: Payload by value, exactly one variant; SessionID as an id.
// Boundary: store.DecodeArtifact in, store.EncodeArtifact out.
// Why: envelope plus a closed payload set, since projection reads in sequence order;
// one open struct would admit records no writer emits.
type Artifact struct {
```

- **First line:** what the thing is, in the project's vocabulary.
- **Owner:** the one actor (thread, goroutine, module, process) that writes it. When
  writing passes from one actor to the next, name the handoff (`the provider builds it,
  then the engine turn after handoff`). Concurrent writers, or one writer per field group,
  is a finding; describe what the code does and list it.
- **Lifetime:** what creates it, what frees or ends it, where it persists.
- **Holds:** each reference to another core structure, marked `owned`, `borrowed`, or
  `id`. Where a copied value shares backing storage (Go slices and maps, reference-counted
  handles), say which side may write it. Omit the line when there are none.
- **Boundary:** each function where bytes become this type and each where it becomes
  bytes; `in only`, `out only`, or `none` when that is the case. Search for every place
  the type is marshalled, including as a field of another serialized type (a CLI's JSON
  output, an RPC result), since a shape change breaks those too. Copy function names from
  the code. Two inbound functions for one format is a finding.
- **Why:** the access pattern that decided the shape and the alternative it beat. In code
  the session did not write, cite the comment, commit, or doc that says so, or write
  `inferred`.

Each line states a fact a reader can check against the code, in one or two lines, and
names functions rather than line numbers, which move. How a function works belongs on
that function. An absolute (`only`, `never`, `nothing else`, `always`) is a claim about
every site: search for the counterexample before writing one, and otherwise say what was
seen. When an existing comment contradicts the code, the record follows the code
and the stale comment goes in the findings.

In a fork the same lines go in the doc under `## <Structure>`, led by
`Defined: path: Type` in backticks.

## The doc

````markdown
# <Project> data model

Scope: whole project | <subsystem> | <the patch intent>
Code: ours | upstream <commit> | upstream <commit> with local changes
Updated: <date>

| Structure | Defined | Owner | Status |
|---|---|---|---|
| Artifact | `internal/artifact/artifact.go: Artifact` | session actor | settled |

## Patch constraints
````

Order the rows as a reading order: start with what `main` builds first and follow `owned`
Holds downward, a persisted structure after the live one that writes it. Status records
who ruled: `settled` (the owner ruled or confirmed), `provisional` (the agent picked or
derived it and the owner has not confirmed), `unmapped` (pointer only, no record yet).
How well a claim is evidenced is the record's business: `inferred` inside a line.
`Patch constraints` appears only for a patch scope and lists the invariants from the
records that the patch must keep. The doc holds the header, the index, and in a fork the
entries and constraints; findings and narrative go in the report.

## Shape rules

These govern structures the session designs. In existing code a departure is a finding
only when the code gives no reason for it; a stated reason is quoted in Why.

- **Variants are sum types.** A field valid only in some states is a variant waiting for a
  name. Test: "can I write a comment saying when this field is valid?"
- **Derived facts are computed.** A flag that must agree with another field is a function
  of that field.
- **Ids across boundaries, pointers inside one owner.** A mutable structure referenced
  from another actor or from a file is named by a branded id, looked up in a registry its
  owner holds. Values that are copied or moved across need none.
- **One parse function per boundary.** External bytes (wire, file, CLI, env) become the
  type in one place. One persisted format, one root type; a saved form that differs only
  in its references is the same type, generic over the reference.
- **Primitives that mean different things get different types.** `UserId` and `OrderId`
  are both strings underneath and are not interchangeable.
- **Interfaces follow the second implementation.** A core structure with one
  implementation is a concrete type; declare the interface at the package that consumes
  it, when a second implementation or a test seam exists.
- **Names.** One name per concept across the type, its file, the doc, and the wire key.
  Vocabulary comes from `CONTEXT.md` when the project has one and from the code's own
  names otherwise; casing from the language's standard style. A constant that bounds a
  structure (capacity, version, magic number) is declared beside the type and named for
  what it means.

Forks the interview keeps meeting, with the question that decides each:

| Fork | Cheap | Expensive | Decides it |
|---|---|---|---|
| Sum type vs optional-field bag | sum: exhaustive matching; bag: direct reads | sum: match before read; bag: contradictory states compile | the comment test above |
| Stored vs derived flag | stored: one read; derived: cannot disagree | stored: every writer can drift it; derived: a computation per read | derive unless measured hot |
| Ids vs pointers | ids: persistable, stale id is a miss; pointers: no lookup | ids: lookup per use; pointers: lifetime coupling, nothing saves | crosses an actor or file: id |
| Whole-file vs database | file: no dependency, hand-editable, diffable; db: indexes, partial writes | file: full parse per read; db: dependency, migrations, opaque to text tools | file size and whether a query needs an index; single-user data that fits in memory starts whole-file, with the condition that reopens the choice written in Why |
| Closed enum vs registry | enum: exhaustive switch, typos fail at load; registry: open-ended | enum: adding one is a code change; registry: unknown names fail late | whether plugins exist |
| One writer vs two | one: no locks, one place to reason | one: readers wait on the owner; two: lost updates | two writers is a finding; make one the owner and the other a request. When both are humans (a settings screen and a text editor on one file), reload, apply, and write atomically, and accept the window |
| One generic type vs saved and live types | generic: a saved file cannot describe what live code cannot build; two: each reads plainly | generic: a type parameter to read; two: they drift on the first change | forms differ only in what they reference: generic |
| Raw index vs owner-adjusted mark | index: an integer; mark: stays correct across edits | index: silently wrong after any edit before it; mark: every edit walks the marks | the position outlives the next edit: mark |

Add a row when an interview meets the same fork twice.

## Procedure

1. **Scope.** Name the situation from the table above and the scope in one line. For a
   patch, the scope is the structures the patch writes, the ones it reads, and their
   holders up to and including the first one the patch leaves unchanged. One new structure
   in a mapped project is a session scoped to that row.

2. **Find candidates.**
   - *New project:* from the owner's description, the spec, and the Data column of
     `docs/FEATURE_MAP.md` when present, list the nouns that persist, cross a boundary,
     or serve several features.
   - *Existing code:* read the design docs, ADRs, and specs the project has first; an
     owner ruling recorded there outranks inference once the code confirms it. Size the
     tree, then make four passes: the public surface (exported headers, package API),
     fan-in (files naming each type, package-qualified where a name repeats, tests
     excluded; a rough ranking is enough), formats (list every file and wire the program
     reads or writes: config, state, cache, credentials, logs, sockets; the root type of
     each is a candidate), and the entry trace (from `main`, what is constructed first and
     lives longest). The passes surface candidates and the core-structure test decides.
     When a format has no declared root (its fields are written procedurally), index the
     type whose methods write it and say so in its Boundary. On a large tree, delegate
     passes to explore children that return `path: Type` and the writers; read the
     declarations yourself.

   Say which candidates get a row and which stay local, and why.

3. **Read or sketch each structure.**
   - *Existing code:* read the declaration, then search for the sites that create or free
     it and the sites that write its fields. Fill the record from what the code does.
     Write `inferred` beside any claim the code does not prove, including an Owner or
     Lifetime line whose search was partial.
   - *New project:* for anything contested, sketch two or three shapes in the project
     language, each with the access pattern it favors and the one it punishes. Ask what
     is read together, what is hot, who owns it, what crosses a boundary, and which
     combination of values must never exist. When a measurable fact decides it (size,
     speed), measure it with throwaway code and let the result rule.

4. **Interview** on the choices that are the owner's: ownership, lifetime, persistence,
   and any boundary that is hard to move later. The interview is how the owner learns the
   architecture: a session that picks defaults the owner does not understand has failed
   even when the defaults are right. One structure at a time, no question cap.
   Each option shows its sketch as the preview and, inside the option description, what
   gets cheap and what gets expensive, with every unfamiliar term defined there. When the
   owner cannot judge, explain with an example from a product they know and ask again.
   When the owner declines or is absent, pick, mark the row `provisional`, and list the
   pick in the report. Existing code needs an interview only for findings.

5. **Write.** Declarations or records per the situation table, then the doc. A new
   project also gets its boundary functions as signatures with stub bodies. In code that
   already exists, the diff contains comments and nothing else.

6. **Check and review.** From the repo root run `scripts/check-model` (in this skill's
   directory) on the doc, then the project build. Then hand the doc and the diff to one
   fresh-context reviewer (default: a review-profile delegate) with the job of refuting
   it: a second writer behind an Owner line, another create or free site behind a
   Lifetime line, an `owned` that is borrowed, a second parse site, a core structure the
   index lacks, an inference written as fact. Fix what the reviewer proves. Bring rulings
   that are the owner's as options.

7. **Report.** Per structure: status, who ruled, and the trade-off that decided it. Then
   the findings, and for an unfamiliar codebase the reading order.

## Maintaining

- A commit that changes a core declaration updates its record in the same commit, and the
  session report quotes that diff. `git log -p` on the model files is the architecture's
  history.
- A change to Owner, Lifetime, or Boundary is a stop: redesign the structure as if the new
  requirement had been there from the first day, put the new sketch to the owner, then
  continue.
- Strain reopens a `settled` row: a second boolean that must track the first, a new field
  valid only sometimes, a branch on a kind field spreading across files, a second writer.
- After rebasing a fork, rerun `check-model`, reread each entry whose pointer failed, and
  update the `upstream` commit.
- Delete the row when a structure stops being core.
