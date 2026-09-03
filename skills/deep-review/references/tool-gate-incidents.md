# Tool-gate incidents

Documented cases where an ungated analyzer would have poisoned a review.
Cited at the tool gate in `SKILL.md` step 8. Append new incidents as real
runs produce them, amending an existing entry when it is the same tool or
failure class.

## PRISM 0.3.0 dead-function sweep on a Zig host

- **Status:** verified
- **Applies to:** tree-sitter and other syntactic analyzers, on any language
  with indirect dispatch the query cannot see
- **Evidence:** PRISM 0.3.0 run against evoker's Zig host (77 files, 41k
  NLOC) flagged 76 distinct dead functions at high confidence, and 71 of
  them (93%) were live, 46 as function values assigned into vtable structs,
  the idiomatic Zig dispatch pattern a syntactic `calls` query cannot see.
- **Provenance:** `~/.agents/wiki/reference/structural-code-maps-for-agents.md`
- **Consequence:** ungated, that is 71 false findings entering the report and
  discrediting the real ones. Run the calibration gate on a file already read
  before admitting any tool's output as evidence.
