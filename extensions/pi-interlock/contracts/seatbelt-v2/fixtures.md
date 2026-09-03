# Seatbelt v2 fixture contract

## Location and manifest

All language-neutral oracles live in `fixtures/seatbelt-v2`. `manifest.json`
schema version 2 lists each JSONL file, exact authored row count, and SHA-256 of
raw file bytes. Files use UTF-8, one compact JSON object per LF-terminated line,
no blank lines, unique IDs, and lexical ID order.

The complete current corpus contains 73 active rows. A policy change starts by
updating this contract and its fixture rows with owner approval; the manifest
digest gate then pins the revised bytes.

## Placeholder expansion

Fixtures use these deterministic placeholders:

- `$ROOT`: fresh temporary test root;
- `$HOME`: `$ROOT/home`;
- `$PI_CONFIG`: `$ROOT/pi-agent`;
- `$AUDIT`: `$PI_CONFIG/var/interlock`;
- `$REPO`: `$ROOT/repo`;
- `$OTHER_REPO`: `$ROOT/other-repo`;
- `$OUTSIDE`: `$ROOT/outside`;
- `$TMP`: `$ROOT/tmp` configured as an appended ephemeral root;
- `$CUSTOM`: `$ROOT/custom-credential`;
- `$BARE_REMOTE`: `$ROOT/remote.git`; and
- `$DEVICE`: `/dev/interlock-fixture-device` (never opened).

Setup creates only paths named by the row under `$ROOT`, except `$DEVICE`,
which is a string oracle. Local Git setup uses isolated repositories and disables
hooks. No fixture opens a live credential, network, provider, device, or user
repository.

`input.mode` is not passed as a tool argument. For each isolated real-Pi run,
the driver starts Pi with `PI_INTERLOCK_MODE` equal to `input.mode`. If
`setup.config` exists, the driver writes exactly one valid user file before
startup:

```json
{
  "schemaVersion": 2,
  "mode": "audit",
  "credentialPaths": [],
  "estateRoots": [],
  "ephemeralRoots": []
}
```

The three arrays are replaced by same-named arrays in `setup.config`; no other
setup config key is accepted. The process override therefore selects the row's
mode while the valid file contributes roots. With no `setup.config`, no user
file exists. `setup.env` is limited to named test seams in the row and cannot
set `PI_INTERLOCK_MODE`.

The only version-2 `setup.env` entry is `{"AUDIT_FAILURE":"1"}` in
`audit.008`. The driver also sets `PI_INTERLOCK_TEST=1`; together they inject an
audit append exception without filesystem error text. Production ignores
`AUDIT_FAILURE` unless the test marker is also present. Audit rows receive the
fixed injected clock `2026-08-14T00:00:00.000Z`; non-audit rows do not inspect
time.

## Compact row schema

Every row has:

```json
{
  "id": "credential.001",
  "class": "hard-hazard",
  "setup": {},
  "input": {"mode":"shield","tool":"read","cwd":"$REPO","arguments":{}},
  "expect": {
    "paths": [],
    "deletes": [],
    "catastrophic": [],
    "pushes": [],
    "observations": [],
    "public": ["deny","credential.direct-access"],
    "shadow": null,
    "effect": "absent",
    "audit": {}
  }
}
```

Path tuple is `[path, access, source]`. Delete tuple is
`[literalTargets, unresolvedTargets, source]`. Push tuple is an object with
only the normalized fields relevant to the row. Omitted optional values are
absent rather than null. Ask effect is
`{"yes":"once","no":"absent","timeout":"absent","noUi":"absent"}`.
Allow effect is `once`, and deny effect is `absent`.

`setup` keys are limited to `dirs`, `files`, `symlinks`, `config`, `env`, and
`git`. `git` freezes repository root, branch, push destination, and local bare
remote state. The test harness rejects any unknown setup or expectation key.
`audit` is optional and freezes redacted tokens, forbidden substrings,
enforcement state, permission modes, fixed failure diagnostic, and the
requirement that the digest recompute from canonical redacted bytes.

## Side-effect oracle

The real-Pi driver never executes a row's requested filesystem, shell, Git,
device, credential, or network operation. It registers a synthetic tool under
the exact `input.tool` name. Pi emits the real pre-execution `tool_call` with
the row's arguments; if and only if the extension allows execution, the
synthetic tool atomically appends one fixed line to
`$ROOT/effects/<row-id>.count` and returns a fixed value-free result.

`once` means the marker contains exactly one line. `absent` means the marker
does not exist. Each yes/no/timeout/no-UI ask case receives a fresh root and Pi
process. Local Git repositories exist only for read-only preflight; the
synthetic tool never pushes. This marker is the sole side-effect oracle and is
independent of policy return values or audit records.

## Current corpus

| file | IDs | rows |
|---|---|---:|
| `credentials.jsonl` | `credential.001`–`.023` | 23 |
| `deletions.jsonl` | `delete.001`–`.018` | 18 |
| `catastrophes.jsonl` | `catastrophic.001`–`.006` | 6 |
| `pushes.jsonl` | `push.001`–`.016` | 16 |
| `audit.jsonl` | `audit.001`–`.010` | 10 |

The corpus contains 73 active rows. Credential row `.023` freezes the
canonicalization-failure behavior clarified after the original 72-row corpus.
