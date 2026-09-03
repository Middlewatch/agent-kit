# Shape trade-offs

Read before putting a choice to the owner. Each fork below is one the interview keeps
meeting; the entry names the shapes, what each makes cheap and expensive, and the
question that usually decides it. Explain these to the owner in the option descriptions
in this form: "cheap: X, expensive: Y." The owner is learning the architecture through
these choices.

## Sum type vs optional-field bag

- Sum type (tagged union): a value is exactly one variant with only that variant's
  fields. Cheap: exhaustive matching, impossible states gone, one place to add a case.
  Expensive: reading a field means matching first.
- Bag of optionals: one struct, fields nullable. Cheap: reading any field directly.
  Expensive: contradictory combinations compile and need comments to explain.
- Decides it: "Can I write a comment saying when this field is valid?" If yes, sum type.

## Stored vs derived

- Stored flag: a field kept in sync by every writer. Cheap: one read. Expensive: every
  writer is a place it can drift; two writers guarantee it will.
- Derived: computed from the field it would shadow (dirty from history position).
  Cheap: cannot disagree. Expensive: a computation on read, usually trivial.
- Decides it: derive unless the computation is measurably hot.

## Ids and registries vs pointers

- Ids: a branded integer looked up in a registry owned by one actor. Cheap: safe to
  persist, stale ids are a lookup miss, one owner frees. Expensive: a lookup per use.
- Pointers: direct references. Cheap: no lookup. Expensive: lifetime coupling; a
  dangling pointer is a crash, and nothing pointer-shaped can be saved.
- Decides it: anything that crosses an actor or a file boundary is an id.

## One tree, generic over its reference

- When a live structure and its saved form differ only in what they point at (ids live,
  paths saved), make the type generic over the reference. Cheap: one shape, a saved file
  cannot describe a layout the live code cannot build. Expensive: a comptime parameter
  to read. The alternative, two structures, drifts on the first change.

## Whole-file vs database

- Whole-file (one typed struct parsed and written entire): cheap: no dependency,
  hand-editable, diffs in a dotfile manager, the file struct is the memory struct.
  Expensive: no partial writes, every read is a full parse, queries are in-memory scans.
- Database: cheap: indexes, partial updates, concurrent readers. Expensive: a C
  dependency or a server, a schema migration story, opaque to text tools.
- Decides it: how big the file gets and whether any query needs an index. Single-user
  tools with data that fits in memory start whole-file and record the reopen condition.

## Single writer

- One actor writes a structure; everyone else reads. Cheap: no locks, no lost updates,
  one place to reason about. Expensive: readers wait on the owner for changes.
- Two writers: a design finding. Resolve by making the file or one actor the owner and
  turning the other writer into a request. When both writers are humans (a GUI menu and
  a text editor on the same config file), reload-apply-write atomically and accept the
  window.

## Tree vs flat list vs grid for layout

- Split tree: cheap: tiling, drag-to-split, resize propagation. Expensive: recursive
  code, a leaf-only invariant to keep.
- Flat list of rectangles: cheap: free placement, trivial persistence. Expensive: the
  owner handles overlap and resize by hand.
- Grid: cheap: predictable, simple hit testing. Expensive: freedom.
- Decides it: what the user drags. Tiling wants the tree; HUD overlays want the flat
  list; both can coexist in one structure.

## Positions that survive edits

- Raw offsets: cheap: an integer. Expensive: stale after any edit before them.
- Marks (buffer-owned positions adjusted on every edit): cheap: excerpts, diagnostics,
  and folds stay correct. Expensive: every edit walks the mark list.
- Decides it: anything that outlives the next edit is a mark.

## Closed enum vs registry

- Closed enum: cheap: exhaustive switch, config names parse to a known set, typos fail
  at load. Expensive: adding one is a code change.
- Runtime registry: cheap: open-ended, plugins. Expensive: no exhaustiveness, unknown
  names fail late.
- Decides it: whether there is a plugin system. No plugins, closed enum.

## Adding a fork

Add a section when an interview meets a fork twice. Keep the shape: two or three options,
cheap and expensive for each, the question that decides it.
