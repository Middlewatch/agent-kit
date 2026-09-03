# agent-delegate

Date: 2026-08-21   Status: done

## Problem

`sol-delegate` routes every child through three fixed model routes, jails each
child to one scope directory, and offers no writable capability and no named
roles. The pstack adoption needs role prompts as versioned files, task-complexity
routing, estate-wide read scopes, and mechanical-edit writers. Owner rulings
2026-08-21 settled the shape; this spec records it.

## Outcome

A renamed `agent-delegate` extension whose test suite proves: tier-based model
routing with root-selectable class and reasoning; agent definitions loaded from
versioned files the root cannot modify or invent; up to four read scopes per
child; a writer class jailed to an extension-created git worktree that returns
a branch instead of applying changes; and both deep skills describing only
functionality that exists. `npm test` green over the whole surface.

## Non-goals

Background or resumable children (interrupt-resume drift), depth greater than
one (briefs decay into telephone), child transcript access (memory scopes cover
the durable form), arbitrary child shell including writers (no sandbox), and
root-supplied model slugs (spend policy stays in the extension).

## Decisions

- Rename in one wave, no compatibility shims: directory, package name, env
  vars (`AGENT_DELEGATE_*`), marker prefix, records dir
  (`~/.local/state/agent-delegate`), details schema tag. Legacy schema tags
  stay readable for old session rows. Old records directory is history and
  stays put.
- Tiers in `tiers.json`: `scout` (Terra low), `analyst` (Sol medium), `judge`
  (Sol high). Profiles default explore→scout, review→analyst,
  research→analyst. New `tier` and `thinking` call params escalate routing by
  class and reasoning only; slugs stay extension-owned.
- Agent definitions in `agents/<name>.agent.md`: frontmatter (profile base,
  tier, thinking, tools subset, writable, turnCap) plus a role prompt appended
  to the child contract. Loaded from the extension directory only; unknown
  keys fail closed; `tools` and `writable` are never overridable per call.
  Seed set: explorer, critic, researcher, refuter, editor.
- `scope` keeps its single-string form; new `scopes` accepts up to four
  directories under the existing home-boundary rules. Relative child paths
  resolve against the first scope; other scopes are addressed absolutely.
- Writers (`writable: true`, only via agent definitions): the extension
  creates `git worktree add` on branch `delegate/<id>` under
  `~/.local/state/agent-delegate/worktrees/<id>`, the child gets jailed
  `write_file`, `edit_file`, and fixed-argv `git_commit` (hooks and signing
  disabled) plus inspection of the worktree, and the return carries branch,
  commit list, and diffstat. The root reviews, merges, and removes the
  worktree. Writer pool: 2.

## Seams under test

The existing suite's seams hold: `AGENT_DELEGATE_CHILD_CMD` fake-child
orchestration tests, per-module unit tests, absorption arithmetic. New tests:
tiers resolution and override validation, agent-definition parsing and
fail-closed cases, multi-scope resolution and cross-scope path jailing, writer
worktree lifecycle including jail-escape attempts (`..`, absolute paths,
symlinks) and the no-execution boundary.

## Slices

- [x] S1 rename sol-delegate → agent-delegate across kit, tests green
- [x] S2 tiers.json + tier/thinking params (after S1)
- [x] S3 agent definitions + seed agents (after S2)
- [x] S4 multi-scope (after S1)
- [x] S5 bounded writer class (after S3)
- [x] S6 docs truth-sync: extension README, child contract,
      delegation-standard, deep-research and deep-review rewrites (after S5)

## Open questions

None blocking. Live smoke of a writer child is deferred to first real use
under owner supervision.
