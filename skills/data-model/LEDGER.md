# data-model ledger

## 2026-09-19 — standalone, code-first rewrite
- Motivation: the owner wants the skill invocable on its own at project start, on an
  unfamiliar codebase, and on a third-party fork, with no reads outside the skill. Review
  of five real `docs/DATA_MODEL.md` files showed built entries growing to 40 to 60 lines
  of prose that restated code (evoker: 716 lines, 28 commits), sketches that never
  compiled, and no home for interfaces, constants, or pointer ownership. The entry-format
  fence was also broken, rendering the back half of the skill as a code block.
- Change: the record (Owner, Lifetime, Holds, Boundary, Why) moves onto the type in code
  the owner controls and stays in the doc for forks; `docs/DATA_MODEL.md` becomes an index;
  `scripts/check-model` resolves pointers, requires records, and rejects Boundary function
  names absent from the tree. Shape rules and the fork table are inlined, with
  `references/shape-tradeoffs.md` folded into the table and deleted (its editor-only
  layout fork dropped); the evoker-mode and language-pack pointers are gone. Tuned over three delegate runs (evoker blind,
  llama.cpp patch scope) and two judge-tier reviews: 12 of 15 and 9 of 15 records sound,
  10 of 10 patch constraints confirmed; errors clustered in missed JSON projections and
  absolutes written from partial searches, each now a rule beside the Boundary line.
