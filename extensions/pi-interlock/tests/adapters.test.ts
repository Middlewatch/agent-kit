import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  MAX_DELETION_REPOSITORY_PROBES,
  normalizeToolCall,
} from "../src/adapters.ts";
import { PathResolutionError } from "../src/paths.ts";

interface GitSetup {
  repo: string;
  branch: string;
  remote?: string;
  pushDestination?: string;
}

interface Row {
  id: string;
  setup: {
    dirs?: string[];
    files?: string[];
    symlinks?: [string, string][];
    git?: GitSetup | GitSetup[];
  };
  input: {
    mode: string;
    tool: string;
    cwd: string;
    arguments: Record<string, unknown>;
  };
  expect: {
    paths: [string, string, string][];
    deletes: [string[], string[], string][];
    catastrophic: string[];
    pushes: Record<string, unknown>[];
    observations: string[];
    public: [string, string];
  };
}

const ACTIVE_FIXTURES = [
  "credentials.jsonl",
  "deletions.jsonl",
  "catastrophes.jsonl",
  "pushes.jsonl",
];
const rows = ACTIVE_FIXTURES.flatMap((file) =>
  readFileSync(
    new URL(`../fixtures/seatbelt-v2/${file}`, import.meta.url),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Row),
);

function substitute(
  value: unknown,
  replacements: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    let text = value;
    for (const [placeholder, replacement] of Object.entries(replacements))
      text = text.replaceAll(placeholder, replacement);
    return text;
  }
  if (Array.isArray(value))
    return value.map((item) => substitute(item, replacements));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        substitute(item, replacements),
      ]),
    );
  return value;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function setupGit(value: GitSetup): void {
  mkdirSync(value.repo, { recursive: true });
  git(value.repo, "init", "-b", value.branch);
  git(value.repo, "config", "user.name", "Interlock Fixture");
  git(value.repo, "config", "user.email", "interlock@example.invalid");
  writeFileSync(join(value.repo, ".fixture"), "fixture\n");
  git(value.repo, "add", ".fixture");
  git(value.repo, "commit", "-m", "fixture");
  if (value.remote === undefined) return;
  mkdirSync(value.remote, { recursive: true });
  execFileSync("git", ["init", "--bare", value.remote], {
    stdio: "ignore",
  });
  git(value.repo, "remote", "add", "origin", value.remote);
  git(value.repo, "push", "-u", "origin", value.branch);
  if (value.pushDestination !== undefined) {
    const slash = value.pushDestination.indexOf("/");
    const remote = value.pushDestination.slice(0, slash);
    const branch = value.pushDestination.slice(slash + 1);
    git(value.repo, "push", remote, `HEAD:refs/heads/${branch}`);
    git(value.repo, "config", `branch.${value.branch}.remote`, remote);
    git(
      value.repo,
      "config",
      `branch.${value.branch}.merge`,
      `refs/heads/${branch}`,
    );
    git(value.repo, "config", "push.default", "upstream");
  }
}

function replacements(root: string): Record<string, string> {
  return {
    $ROOT: root,
    $HOME: join(root, "home"),
    $PI_CONFIG: join(root, "pi-agent"),
    $AUDIT: join(root, "pi-agent", "var/interlock"),
    $REPO: join(root, "repo"),
    $OTHER_REPO: join(root, "other-repo"),
    $OUTSIDE: join(root, "outside"),
    $TMP: join(root, "tmp"),
    $CUSTOM: join(root, "custom-credential"),
    $BARE_REMOTE: join(root, "remote.git"),
    $DEVICE: "/dev/interlock-fixture-device",
  };
}

function prepare(row: Row, root: string): Record<string, string> {
  const values = replacements(root);
  const setup = substitute(row.setup, values) as Row["setup"];
  for (const directory of setup.dirs ?? [])
    mkdirSync(directory, { recursive: true });
  for (const file of setup.files ?? []) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "fixture");
  }
  for (const [link, target] of setup.symlinks ?? []) symlinkSync(target, link);
  const repositories = Array.isArray(setup.git)
    ? setup.git
    : setup.git === undefined
      ? []
      : [setup.git];
  for (const repository of repositories) setupGit(repository);
  return values;
}

test("all 63 active rows normalize to the frozen operation oracle", () => {
  assert.equal(rows.length, 63);
  for (const row of rows) {
    const root = mkdtempSync(join(tmpdir(), "interlock-adapter-"));
    try {
      const values = prepare(row, root);
      const input = substitute(row.input, values) as Row["input"];
      const expected = substitute(row.expect, values) as Row["expect"];
      if (input.mode === "off") {
        assert.deepEqual(expected.paths, [], row.id);
        assert.deepEqual(expected.deletes, [], row.id);
        assert.deepEqual(expected.catastrophic, [], row.id);
        assert.deepEqual(expected.pushes, [], row.id);
        assert.deepEqual(expected.observations, [], row.id);
        continue;
      }
      if (expected.public[1] === "path.resolution-failed") {
        assert.throws(
          () =>
            normalizeToolCall(
              { toolName: input.tool, input: input.arguments },
              { cwd: input.cwd, home: values.$HOME! },
            ),
          PathResolutionError,
          row.id,
        );
        continue;
      }
      const operation = normalizeToolCall(
        { toolName: input.tool, input: input.arguments },
        { cwd: input.cwd, home: values.$HOME! },
      );
      assert.deepEqual(
        operation,
        {
          tool: input.tool,
          cwd: input.cwd,
          authorityRoot: input.cwd,
          paths: expected.paths.map(([path, access, source]) => ({
            path,
            access,
            source,
          })),
          recursiveDeletes: expected.deletes.map(
            ([targets, unresolvedTargets, source]) => ({
              targets,
              unresolvedTargets,
              source,
            }),
          ),
          catastrophic: expected.catastrophic,
          pushes: expected.pushes.map((push) => ({ cwd: input.cwd, ...push })),
          observations: expected.observations,
        },
        row.id,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("recursive deletion bounds and exposes repository probes", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-probe-budget-"));
  try {
    const targets = Array.from(
      { length: MAX_DELETION_REPOSITORY_PROBES + 2 },
      (_, index) => `target-${index}`,
    );
    for (const target of targets) mkdirSync(join(root, target));
    let probes = 0;
    const operation = normalizeToolCall(
      {
        toolName: "bash",
        input: { command: `rm -rf ${targets.join(" ")}` },
      },
      {
        cwd: root,
        home: root,
        gitRunner: () => {
          probes += 1;
          return { ok: false, stdout: "" };
        },
      },
    );
    assert.equal(probes, MAX_DELETION_REPOSITORY_PROBES + 1);
    assert.deepEqual(
      operation.recursiveDeletes[0]?.unresolvedTargets,
      targets
        .slice(MAX_DELETION_REPOSITORY_PROBES)
        .map((target) => join(root, target)),
    );
    assert.deepEqual(operation.observations, ["unresolved-delete-target"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown tools and malformed known fields never guess protected paths", () => {
  const env = { cwd: "/work", home: "/users/owner" };
  assert.deepEqual(
    normalizeToolCall(
      { toolName: "custom_read", input: { path: "/secret" } },
      env,
    ).paths,
    [],
  );
  for (const call of [
    { toolName: "read", input: { path: "/secret", file_path: "/secret" } },
    { toolName: "read", input: { path: "/secret", file_path: 7 } },
    { toolName: "grep", input: { path: 7 } },
    { toolName: "delete", input: { path: "/secret", recursive: "yes" } },
    {
      toolName: "apply_patch",
      input: {
        patch:
          "*** Begin Patch\n*** Add File: /safe\n+x\n*** Delete File:\n*** End Patch",
      },
    },
  ]) {
    const operation = normalizeToolCall(call, env);
    assert.deepEqual(operation.paths, [], call.toolName);
    assert.equal(operation.observations.length, 1, call.toolName);
  }
});

test("tool-specific path aliases ignore extras instead of reclassifying them", () => {
  const env = { cwd: "/repo", home: "/users/owner" };
  for (const toolName of ["grep", "find", "ls"]) {
    const operation = normalizeToolCall(
      { toolName, input: { file_path: "/secret" } },
      env,
    );
    assert.deepEqual(operation.paths, [
      { path: "/repo", access: "read", source: "default.cwd" },
    ]);
    assert.deepEqual(operation.observations, []);
  }
  const deletion = normalizeToolCall(
    { toolName: "delete", input: { file_path: "/secret" } },
    env,
  );
  assert.deepEqual(deletion.paths, []);
  assert.deepEqual(deletion.observations, ["unsupported:delete"]);
});

test("malformed patches validate completely before canonicalizing any path", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-malformed-patch-"));
  try {
    const loop = join(root, "loop");
    symlinkSync(loop, loop);
    const operation = normalizeToolCall(
      {
        toolName: "apply_patch",
        input: {
          patch: `*** Begin Patch\n*** Add File: ${loop}\n+x\n*** Delete File:\n*** End Patch`,
        },
      },
      { cwd: root, home: root },
    );
    assert.deepEqual(operation.paths, []);
    assert.deepEqual(operation.observations, ["unsupported:apply_patch"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
