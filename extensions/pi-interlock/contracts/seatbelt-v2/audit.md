# Seatbelt v2 audit contract

## Disposition

Audit mode computes shield's decision, records it in `shadow`, returns public
`allow/default.allow`, and executes the original call. It never confirms or
blocks. Shield records every decision during calibration. That recording may
be reduced only by a later amendment after calibration remains derivable.

## Path and permissions

Records append to
`<active-config>/var/interlock/decisions-YYYY-MM-DD.ndjson`. Directory mode is
`0700`, and file mode is `0600`. The final file must be absent or a regular
non-symlink file. No descriptor-relative or hostile-same-user guarantees are
claimed.

## Record schema

Each one-line object has exactly:

```json
{
  "schemaVersion": 2,
  "timestamp": "RFC3339 UTC",
  "mode": "audit",
  "tool": "read",
  "shape": {},
  "publicVerdict": "allow",
  "publicRuleId": "default.allow",
  "shadowVerdict": "deny",
  "shadowRuleId": "credential.direct-access",
  "enforcement": "shadow",
  "digest": "sha256:..."
}
```

Audit records use `mode: "audit"`, public allow/default, non-null shadow fields,
and `enforcement: "shadow"`. Shield records use `mode: "shield"`, the enforced
public verdict/rule, `shadowVerdict: null`, `shadowRuleId: null`, and
`enforcement: "enforced"`. Off emits no record. Fields are never omitted.

## Redaction before hashing

No absolute path is retained. Canonical filesystem paths, cwd, authority root,
and Git root become only these tokens:

- `@credential` for a protected credential/audit root or descendant;
- `@home` for exact home;
- `@estate` for an estate root or descendant;
- `@ephemeral` for an ephemeral root or descendant;
- `@authority` for authority root or descendant;
- `@outside` for every other path; and
- `@unresolved` for an unresolved expression.

The shape retains access kind, source-label class, counts, booleans, bulk kind,
whether a protected destination was found, and observation IDs. It does not
retain basenames, path depth, command text, arguments, environment/header/body
values, Git remote names, branch names other than protected yes/no, or file
contents. Remote and refspec strings are omitted rather than converted to path
tokens.

`shape` has exactly these keys:

```json
{
  "cwd": "@authority",
  "authority": "@authority",
  "paths": [
    {"token":"@credential","access":"read","source":"argument"}
  ],
  "recursiveDeletes": [
    {"literalTokens":["@authority"],"unresolvedCount":0,"source":"rm"}
  ],
  "catastrophic": [],
  "pushes": [
    {
      "remotePresent": false,
      "refspecCount": 0,
      "explicitProtectedDestination": false,
      "resolvedProtectedDestination": true,
      "currentBranchProtected": true,
      "force": false,
      "bulk": "none",
      "stateResolved": true
    }
  ],
  "observations": []
}
```

All keys are present, including empty arrays. Path token precedence is
`@credential`, exact `@home`, `@estate`, `@ephemeral`, `@authority`, then
`@outside`. A descendant uses the first matching category. An unresolved direct
glob that can select a protected credential path or tree is tokenized as
`@credential` rather than preserving the pattern. Cwd and authority use the
same precedence and can therefore be `@credential`.

Path source classes are exact: `arg.*` and `find.root` become `argument`,
`redirect.*` becomes `redirect`, `patch.*` becomes `patch`, `executable`
remains `executable`, and `tool.delete` becomes `tool`. Recursive-delete source
is the exact bounded value `rm`, `find`, or `tool.delete`.

Arrays preserve normalized operation order. Observation strings preserve
detector order. Push booleans are derived from normalized destinations before
their strings are discarded. `currentBranchProtected` is false when branch
state is absent or nonprotected.

Canonical JSON for hashing recursively sorts object keys by Unicode code point,
preserves array order, uses UTF-8 with no insignificant whitespace, and uses
JSON literals for booleans, null, strings, and schema integers. The complete
record except `digest` is serialized this way, and `digest` is lowercase
SHA-256 prefixed with `sha256:`.

Redaction happens before canonical JSON serialization and SHA-256. `digest` is
computed over the complete record without its digest field.

## Failures

On any directory, file, append, serialization, or permission failure, emit the
exact diagnostic `interlock: audit write failed` and set in-memory degraded
status. Do not include path, errno text, rejected data, or tool input. Policy
and public verdict do not change.
