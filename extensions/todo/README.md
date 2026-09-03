# todo

A session step list with a visible skip state, built for evoker-mode's
playbook contract. The router copies a matched playbook's numbered steps in
verbatim (`set`), then marks each one `active`, `done`, or `skip` as work
proceeds. A `skip` without a one-line reason is rejected by the tool, which
makes the playbook standard's visible-skip rule a code gate instead of an
instruction. It also works as a plain task list in any session without the
router.

State lives in tool result details and is replayed from the session branch,
so branching reconstructs the list correctly (the same pattern as pi's
`examples/extensions/todo.ts`, which seeded this extension).

## Surface

- `todo` tool: `set` (replace, in order), `add` (append), `status`
  (pending/active/done/skip by id), `list`, `clear`.
- `/todos` command: full-screen viewer for the current branch's list.

## Status

Active: registered in the kit `package.json` under `pi.extensions`.
Running sessions pick it up after a restart or `/reload`.

Claude Code sessions have their own TodoWrite tool. This extension closes
the same gap on pi.
