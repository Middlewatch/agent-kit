# Seatbelt v2 configuration contract

## Precedence and defaults

Root configuration and the initial mode resolve when the extension loads:

1. Start with built-ins and mode `audit`.
2. If `<active-config-root>/interlock.json` is absent, keep that result.
3. If the file is valid schema version 2, append its path arrays and replace
   mode with its `mode` value.
4. If the file is invalid, discard the complete file layer, emit exactly one
   value-free diagnostic, and keep built-ins with mode `audit`.
5. If `PI_INTERLOCK_MODE` is exactly `off`, `audit`, or `shield`, replace mode
   after file handling. If it is present with another value, emit exactly one
   value-free diagnostic and leave the mode from steps 1–4 unchanged.

A valid process override still applies when the user file is invalid. Neither
diagnostic contains a path, rejected value, file contents, or environment
value.

Project files are never loaded.

After startup, the `/interlock` command may replace the active mode as described
below. It does not recalculate configured roots.

| case | file result | process value | final mode | diagnostics |
|---|---|---|---|---:|
| absent file | built-ins | absent | audit | 0 |
| valid shield file | merged | absent | shield | 0 |
| valid off file | merged | absent | off | 0 |
| invalid file | discarded | absent | audit | 1 |
| valid audit file | merged | shield | shield | 0 |
| valid shield file | merged | invalid | shield | 1 |
| invalid file | discarded | off | off | 1 |
| unknown file key | discarded | absent | audit | 1 |
| valid appended roots in shield file | merged/deduplicated | absent | shield | 0 |
| valid project-local file only | ignored | absent | audit | 0 |

## JSON shape

The UTF-8 file is one JSON object:

```json
{
  "schemaVersion": 2,
  "mode": "off",
  "credentialPaths": ["~/.example-auth"],
  "estateRoots": ["~/durable"],
  "ephemeralRoots": ["~/scratch"]
}
```

Required keys are `schemaVersion` and `mode`. The three path arrays are
optional and default to empty. Unknown keys, duplicate keys, non-string array
members, empty strings, NUL bytes, globs, and relative paths invalidate the
complete layer. `~`, `$HOME`, and `${HOME}` are accepted only as a complete
leading path component and expand to the supplied home directory.

Configured paths append to built-ins after canonicalization and exact duplicate
removal. Order is built-ins followed by first occurrence in user order.

## Runtime mode control

Pi registers one extension command:

- `/interlock` reports the active mode;
- `/interlock off`, `/interlock audit`, and `/interlock shield` save and activate
  that exact mode; and
- every other argument reports `Usage: /interlock off|audit|shield` and changes
  nothing.

A successful change preserves every existing valid path array, writes
`<active-config-root>/interlock.json` through an owner-only temporary file and
atomic rename, and then changes the in-memory mode used by subsequent tool
calls. An absent file is created with schema version 2 and the selected mode. An
invalid existing file or any save failure leaves both the file and active mode
unchanged.

The footer displays `Interlock: <mode>` in TUI sessions and updates after a
successful command. `PI_INTERLOCK_MODE` has precedence only while initial
configuration is loaded. A command may change the live mode afterward, but the
command reports when the process override will supersede the saved default on
extension reload or process restart.

## Built-in roots

Credential/audit roots:

| kind | path relative to home or active Pi config |
|---|---|
| exact | `<active-config>/auth.json` |
| tree | `<active-config>/keys` |
| tree | `<active-config>/var/interlock` |
| tree | `~/.ssh` |
| tree | `~/.gnupg` |
| tree | `~/.aws` |
| tree | `~/.azure` |
| tree | `~/.kube` |
| tree | `~/.config/gcloud` |
| tree | `~/.config/rpiv-web-tools` |
| exact | `~/.docker/config.json` |
| exact | `~/.netrc` |
| exact | `~/.pypirc` |
| exact | `~/.git-credentials` |

Configured `credentialPaths` are trees. There is no generic basename or suffix
matching.

The default estate roots (an opinionated built-in list; configuration may
append to it) are `~/projects`, `~/vendor`, `~/work`, `~/research`,
`~/experiments`, `~/archive`, `~/wiki`, `~/journals`, `~/intake`, and `~/models`.

Ephemeral roots are `/tmp`, `/var/tmp`, `~/.cache`, and the canonical current
`PI_SCRATCHPAD` when that process value is a nonempty absolute path. An invalid
scratchpad value is ignored with the same value-free environment diagnostic
class and does not invalidate user configuration.

## Canonicalization

Each literal path becomes an absolute lexical path from home, then resolves
existing symlinks component by component. A missing suffix is appended to the
realpath of its deepest existing ancestor. Resolution error invalidates a user
layer. A tool-input resolution error emits no normalized operation and is a
`path.resolution-failed` deny in shield, public allow/default with that deny in
shadow in audit, and allow without inspection in off. Its fixed reason is
value-free.

Exact roots match only the exact canonical path. Tree roots match the exact
root and descendants on component boundaries. Comparison is byte-for-byte and
case-sensitive.
