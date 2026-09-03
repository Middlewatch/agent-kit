# Seatbelt v2 stable reasons

Reasons are stable identifiers plus fixed human text. They never contain raw
paths, credential-root names, environment values, refspec contents, command
arguments, or audit errors.

| rule ID | verdict | fixed text |
|---|---|---|
| `credential.direct-access` | deny | Direct credential-store access is blocked. |
| `credential.audit-access` | deny | Direct Interlock audit access is blocked. |
| `path.resolution-failed` | deny | Path resolution failed; the operation is blocked. |
| `catastrophic.root-recursive` | deny | Recursive filesystem-root deletion is blocked. |
| `catastrophic.raw-device` | deny | Direct raw-device overwrite is blocked. |
| `catastrophic.filesystem-format` | deny | Direct filesystem formatting is blocked. |
| `catastrophic.fork-bomb` | deny | Direct process fork bomb is blocked. |
| `delete.boundary` | ask | Confirm recursive deletion across a protected boundary. |
| `push.protected-branch` | ask | Confirm push to a protected branch. |
| `push.force-or-bulk` | ask | Confirm force or bulk push. |
| `default.allow` | allow | No seatbelt rule matched. |

The confirmation pane separately renders Pi's exact pending tool call. The
reason itself remains value-free.

Observations are fixed identifiers rather than verdict reasons:
`unsupported:<family>`, `git-state-unresolved`, `unresolved-delete-target`,
and `audit-degraded`.
