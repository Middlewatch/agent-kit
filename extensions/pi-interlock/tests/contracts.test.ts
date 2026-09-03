import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);
const FIXTURES = new URL("fixtures/seatbelt-v2/", ROOT);

interface ManifestFile {
  path: string;
  firstId: string;
  lastId: string;
  rows: number;
  sha256: string;
}

interface Manifest {
  schemaVersion: number;
  authoredRows: number;
  files: ManifestFile[];
}

const CLASSES = new Set(["hard-hazard", "ordinary", "owner-gated"]);
const MODES = new Set(["off", "audit", "shield"]);
const ACCESSES = new Set([
  "read",
  "create",
  "edit",
  "append",
  "truncate",
  "replace",
  "move",
  "delete",
  "execute",
]);
const RULE_IDS = new Set([
  "credential.direct-access",
  "credential.audit-access",
  "path.resolution-failed",
  "catastrophic.root-recursive",
  "catastrophic.raw-device",
  "catastrophic.filesystem-format",
  "catastrophic.fork-bomb",
  "delete.boundary",
  "push.protected-branch",
  "push.force-or-bulk",
  "default.allow",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    label,
  );
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  label: string,
): void {
  for (const key of required)
    assert(Object.hasOwn(value, key), `${label}.${key}`);
  const allowed = new Set([...required, ...optional]);
  assert(
    Object.keys(value).every((key) => allowed.has(key)),
    `${label} unknown key`,
  );
}

function stringArray(value: unknown, label: string): asserts value is string[] {
  assert(
    Array.isArray(value) && value.every((item) => typeof item === "string"),
    label,
  );
}

function tuple(
  value: unknown,
  length: number,
  label: string,
): asserts value is unknown[] {
  assert(Array.isArray(value) && value.length === length, label);
}

function validateSetup(value: unknown, label: string): void {
  const setup = record(value, label);
  exactKeys(
    setup,
    [],
    ["dirs", "files", "symlinks", "config", "env", "git"],
    label,
  );
  for (const key of ["dirs", "files"])
    if (setup[key] !== undefined) stringArray(setup[key], `${label}.${key}`);
  if (setup.symlinks !== undefined) {
    assert(Array.isArray(setup.symlinks), `${label}.symlinks`);
    for (const [index, link] of setup.symlinks.entries()) {
      tuple(link, 2, `${label}.symlinks[${index}]`);
      assert(
        link.every((item) => typeof item === "string"),
        `${label}.symlinks[${index}]`,
      );
    }
  }
  if (setup.config !== undefined) {
    const config = record(setup.config, `${label}.config`);
    exactKeys(
      config,
      [],
      ["credentialPaths", "estateRoots", "ephemeralRoots"],
      `${label}.config`,
    );
    for (const [key, item] of Object.entries(config))
      stringArray(item, `${label}.config.${key}`);
  }
  if (setup.env !== undefined) {
    const env = record(setup.env, `${label}.env`);
    assert.deepEqual(env, { AUDIT_FAILURE: "1" }, `${label}.env`);
  }
  if (setup.git !== undefined) {
    const repositories = Array.isArray(setup.git) ? setup.git : [setup.git];
    assert(repositories.length > 0, `${label}.git`);
    for (const [index, item] of repositories.entries()) {
      const git = record(item, `${label}.git[${index}]`);
      exactKeys(
        git,
        ["repo", "branch"],
        ["remote", "pushDestination"],
        `${label}.git[${index}]`,
      );
      for (const [key, field] of Object.entries(git))
        assert.equal(typeof field, "string", `${label}.git[${index}].${key}`);
    }
  }
}

function validateDecision(value: unknown, label: string): void {
  tuple(value, 2, label);
  assert(
    new Set(["allow", "ask", "deny"]).has(value[0] as string),
    `${label}.verdict`,
  );
  assert(RULE_IDS.has(value[1] as string), `${label}.rule`);
}

function validateExpect(value: unknown, label: string): void {
  const expected = record(value, label);
  exactKeys(
    expected,
    [
      "paths",
      "deletes",
      "catastrophic",
      "pushes",
      "observations",
      "public",
      "shadow",
      "effect",
    ],
    ["audit"],
    label,
  );
  assert(Array.isArray(expected.paths), `${label}.paths`);
  for (const [index, item] of expected.paths.entries()) {
    tuple(item, 3, `${label}.paths[${index}]`);
    assert.equal(typeof item[0], "string", `${label}.paths[${index}].path`);
    assert(ACCESSES.has(item[1] as string), `${label}.paths[${index}].access`);
    assert.equal(typeof item[2], "string", `${label}.paths[${index}].source`);
  }
  assert(Array.isArray(expected.deletes), `${label}.deletes`);
  for (const [index, item] of expected.deletes.entries()) {
    tuple(item, 3, `${label}.deletes[${index}]`);
    stringArray(item[0], `${label}.deletes[${index}].targets`);
    stringArray(item[1], `${label}.deletes[${index}].unresolved`);
    assert.equal(typeof item[2], "string", `${label}.deletes[${index}].source`);
  }
  stringArray(expected.catastrophic, `${label}.catastrophic`);
  assert(
    expected.catastrophic.every((id) => RULE_IDS.has(id)),
    `${label}.catastrophic rule`,
  );
  assert(Array.isArray(expected.pushes), `${label}.pushes`);
  for (const [index, item] of expected.pushes.entries()) {
    const push = record(item, `${label}.pushes[${index}]`);
    exactKeys(
      push,
      [
        "refspecs",
        "destinations",
        "resolvedDestinations",
        "force",
        "bulk",
        "stateResolved",
      ],
      ["remote", "currentBranch"],
      `${label}.pushes[${index}]`,
    );
    for (const key of ["refspecs", "destinations", "resolvedDestinations"])
      stringArray(push[key], `${label}.pushes[${index}].${key}`);
    for (const key of ["remote", "currentBranch"])
      if (push[key] !== undefined)
        assert.equal(
          typeof push[key],
          "string",
          `${label}.pushes[${index}].${key}`,
        );
    assert.equal(
      typeof push.force,
      "boolean",
      `${label}.pushes[${index}].force`,
    );
    assert(
      new Set(["none", "all", "mirror"]).has(push.bulk as string),
      `${label}.pushes[${index}].bulk`,
    );
    assert.equal(
      typeof push.stateResolved,
      "boolean",
      `${label}.pushes[${index}].stateResolved`,
    );
  }
  stringArray(expected.observations, `${label}.observations`);
  for (const observation of expected.observations)
    assert(
      new Set([
        "git-state-unresolved",
        "unresolved-delete-target",
        "audit-degraded",
      ]).has(observation) || /^unsupported:[a-z][a-z0-9_-]*$/.test(observation),
      `${label}.observations identifier`,
    );
  validateDecision(expected.public, `${label}.public`);
  if (expected.shadow !== null)
    validateDecision(expected.shadow, `${label}.shadow`);
  if (typeof expected.effect === "string")
    assert(new Set(["once", "absent"]).has(expected.effect), `${label}.effect`);
  else
    assert.deepEqual(
      expected.effect,
      {
        yes: "once",
        no: "absent",
        timeout: "absent",
        noUi: "absent",
      },
      `${label}.effect`,
    );
  if (expected.audit !== undefined) {
    const audit = record(expected.audit, `${label}.audit`);
    if (Object.hasOwn(audit, "write")) {
      exactKeys(audit, ["write", "diagnostic", "forbid"], [], `${label}.audit`);
      assert.equal(audit.write, "failed", `${label}.audit.write`);
      assert.equal(
        audit.diagnostic,
        "interlock: audit write failed",
        `${label}.audit.diagnostic`,
      );
      stringArray(audit.forbid, `${label}.audit.forbid`);
    } else {
      exactKeys(
        audit,
        ["enforcement", "pathTokens", "forbid", "digestVerified"],
        ["directoryMode", "fileMode", "protectedDestination"],
        `${label}.audit`,
      );
      assert(
        new Set(["shadow", "enforced"]).has(audit.enforcement as string),
        `${label}.audit.enforcement`,
      );
      stringArray(audit.pathTokens, `${label}.audit.pathTokens`);
      assert(
        audit.pathTokens.every((token) =>
          new Set([
            "@credential",
            "@home",
            "@estate",
            "@ephemeral",
            "@authority",
            "@outside",
          ]).has(token),
        ),
        `${label}.audit.pathTokens value`,
      );
      stringArray(audit.forbid, `${label}.audit.forbid`);
      assert.equal(audit.digestVerified, true, `${label}.audit.digestVerified`);
      const hasDirectoryMode = Object.hasOwn(audit, "directoryMode");
      const hasFileMode = Object.hasOwn(audit, "fileMode");
      assert.equal(hasDirectoryMode, hasFileMode, `${label}.audit modes`);
      if (hasDirectoryMode) {
        assert.equal(
          audit.directoryMode,
          "0700",
          `${label}.audit.directoryMode`,
        );
        assert.equal(audit.fileMode, "0600", `${label}.audit.fileMode`);
      }
      if (Object.hasOwn(audit, "protectedDestination"))
        assert.equal(
          audit.protectedDestination,
          true,
          `${label}.audit.protectedDestination`,
        );
    }
  }
}

function validateRow(value: unknown, label: string): Record<string, unknown> {
  const row = record(value, label);
  assert.deepEqual(
    Object.keys(row),
    ["id", "class", "setup", "input", "expect"],
    label,
  );
  assert.equal(typeof row.id, "string", `${label}.id`);
  assert(CLASSES.has(row.class as string), `${label}.class`);
  validateSetup(row.setup, `${label}.setup`);
  const input = record(row.input, `${label}.input`);
  assert.deepEqual(
    Object.keys(input),
    ["mode", "tool", "cwd", "arguments"],
    `${label}.input`,
  );
  assert(MODES.has(input.mode as string), `${label}.input.mode`);
  assert.equal(typeof input.tool, "string", `${label}.input.tool`);
  assert.equal(typeof input.cwd, "string", `${label}.input.cwd`);
  record(input.arguments, `${label}.input.arguments`);
  validateExpect(row.expect, `${label}.expect`);
  return row;
}

test("current v2 manifest pins every authored row and raw byte digest", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", FIXTURES), "utf8"),
  ) as Manifest;
  assert.deepEqual(Object.keys(manifest), [
    "schemaVersion",
    "authoredRows",
    "files",
  ]);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.authoredRows, 73);
  assert.deepEqual(
    manifest.files.map(({ sha256: _sha256, ...entry }) => entry),
    [
      {
        path: "credentials.jsonl",
        firstId: "credential.001",
        lastId: "credential.023",
        rows: 23,
      },
      {
        path: "deletions.jsonl",
        firstId: "delete.001",
        lastId: "delete.018",
        rows: 18,
      },
      {
        path: "catastrophes.jsonl",
        firstId: "catastrophic.001",
        lastId: "catastrophic.006",
        rows: 6,
      },
      {
        path: "pushes.jsonl",
        firstId: "push.001",
        lastId: "push.016",
        rows: 16,
      },
      {
        path: "audit.jsonl",
        firstId: "audit.001",
        lastId: "audit.010",
        rows: 10,
      },
    ],
  );

  const ids: string[] = [];
  for (const entry of manifest.files) {
    assert.deepEqual(
      Object.keys(entry),
      ["path", "firstId", "lastId", "rows", "sha256"],
      entry.path,
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${entry.path} digest`);
    const bytes = readFileSync(new URL(entry.path, FIXTURES));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
    );
    assert(bytes.toString().endsWith("\n"), entry.path);
    const lines = bytes.toString().trimEnd().split("\n");
    assert.equal(lines.length, entry.rows, entry.path);
    const rows = lines.map((line, index) =>
      validateRow(JSON.parse(line) as unknown, `${entry.path}:${index + 1}`),
    );
    assert.equal(rows[0]?.id, entry.firstId);
    assert.equal(rows.at(-1)?.id, entry.lastId);
    assert.deepEqual(
      rows.map((row) => row.id),
      rows.map((row) => row.id).toSorted(),
      `${entry.path} lexical order`,
    );
    for (const row of rows) ids.push(row.id as string);
  }
  assert.equal(ids.length, 73);
  assert.equal(new Set(ids).size, 73);
  assert.equal(
    manifest.files.reduce((sum, entry) => sum + entry.rows, 0),
    73,
  );
});

test("the runtime contract has no abandoned v1 policy surface", () => {
  const files = [
    "index.ts",
    "src/contracts.ts",
    "src/config.ts",
    "src/adapters.ts",
    "src/policy.ts",
    "src/audit.ts",
  ];
  const abandoned = [
    '"enforce"',
    "auditTarget",
    "protectedWrite",
    "denyCommands",
    "trustedSsh",
    "trustedGit",
    "projectAllow",
    "projectRestriction",
    "egress",
    "zero.secret-path",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, ROOT), "utf8");
    for (const token of abandoned)
      assert(!source.includes(token), `${file} retained ${token}`);
  }
});
