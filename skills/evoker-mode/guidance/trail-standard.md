# Trail standard

Skills that run unattended, span sessions, or produce work the owner reviews after the
fact import this by path. The trail format and tool are adapted from pstack's
`show-me-your-work` (github.com/cursor/plugins, MIT).

## Claim

Long work loses its reasoning. The commit log records what changed; nothing records what
was decided, why, and what evidence backed it. A trail is that record: one append-only
TSV, one row per decision, written at the moment the decision is made. Its reader is the
owner returning to work they did not watch, or the next agent inheriting it.

## When a trail earns its place

Open a trail when any of these hold:

- The owner steps away and will review the work later.
- The work spans more than one session or agent.
- The work is a loop of accept/reject calls (hypotheses, migration waves, tuning runs)
  where the rejects are as informative as the keeps.

Skip the trail for ordinary supervised work. There, the conversation and the commit
messages are the record, and a trail is ceremony. Skip it likewise for a spec'd build,
even unattended: `build`'s commit messages carry the decisions and the spec's slice
checklist carries status. Open one there only when the owner asks for an auditable record.

## The trail file

`trail.tsv` at the worktree root, gitignored by default. Commit it only when the owner
wants an auditable record in the repo. Columns:

| column | holds |
|---|---|
| `ts` | UTC timestamp, written by the tool. |
| `step` | which phase or loop iteration this row belongs to. |
| `decision` | what was decided or done, one line. |
| `why` | the reason, one line. |
| `evidence` | a path, command, URL, or measurement a reviewer can open or rerun. |
| `result` | what happened: kept, reverted, pass, fail, blocked. |

Append rows with the `trail` tool, which owns the header, the timestamp, and cell
sanitization (tabs, newlines, and carriage returns become spaces; other control characters
are dropped; a leading `=`, `+`, `-`, or `@` gains a quote prefix so spreadsheets treat
the cell as text):

```
trail trail.tsv build "chose sqlite over flat files" "single writer, one file to back up" "bench/results.md" kept
```

A row's `evidence` cell must resolve: before handing the work back, open or rerun each
one. A row whose evidence points at nothing gets a superseding row appended naming the
correction; the trail stays append-only. An unresolvable evidence cell is the trail
equivalent of a fabricated citation.

## Pausing and resuming

The trail records decisions; a **resume note** records position. They are different
documents with different lifetimes. The trail survives the work. The resume note is a
baton: written by `playbooks/pause-safely.md` as `RESUME.md` at the worktree root,
consumed and deleted by `playbooks/session-pickup.md`. The note points at the trail
instead of duplicating it.
