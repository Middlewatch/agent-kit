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
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeToolCall } from "../src/adapters.ts";
import { loadConfig } from "../src/config.ts";
import type { Mode } from "../src/contracts.ts";
import { PathResolutionError } from "../src/paths.ts";
import { decideOperation, pathResolutionDecision } from "../src/policy.ts";

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
    config?: Record<string, string[]>;
    git?: GitSetup | GitSetup[];
  };
  input: {
    mode: Mode;
    tool: string;
    cwd: string;
    arguments: Record<string, unknown>;
  };
  expect: { public: [string, string]; shadow: [string, string] | null };
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
  execFileSync("git", ["init", "--bare", value.remote], { stdio: "ignore" });
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

test("all 63 active decisions match the frozen oracle", () => {
  assert.equal(rows.length, 63);
  for (const row of rows) {
    const root = mkdtempSync(join(homedir(), ".interlock-policy-"));
    try {
      const replacements = {
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
      const setup = substitute(row.setup, replacements) as Row["setup"];
      for (const directory of setup.dirs ?? [])
        mkdirSync(directory, { recursive: true });
      for (const file of setup.files ?? []) {
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, "fixture");
      }
      for (const [link, target] of setup.symlinks ?? [])
        symlinkSync(target, link);
      const repositories = Array.isArray(setup.git)
        ? setup.git
        : setup.git === undefined
          ? []
          : [setup.git];
      for (const repository of repositories) setupGit(repository);
      if (setup.config !== undefined) {
        mkdirSync(replacements.$PI_CONFIG, { recursive: true });
        writeFileSync(
          join(replacements.$PI_CONFIG, "interlock.json"),
          JSON.stringify({
            schemaVersion: 2,
            mode: "audit",
            credentialPaths: setup.config.credentialPaths ?? [],
            estateRoots: setup.config.estateRoots ?? [],
            ephemeralRoots: setup.config.ephemeralRoots ?? [],
          }),
        );
      }
      const input = substitute(row.input, replacements) as Row["input"];
      const config = loadConfig({
        agentDir: replacements.$PI_CONFIG,
        home: replacements.$HOME,
        processMode: input.mode,
      });
      let decision;
      try {
        const operation =
          input.mode === "off"
            ? {
                tool: input.tool,
                cwd: input.cwd,
                authorityRoot: input.cwd,
                paths: [],
                recursiveDeletes: [],
                catastrophic: [],
                pushes: [],
                observations: [],
              }
            : normalizeToolCall(
                { toolName: input.tool, input: input.arguments },
                { cwd: input.cwd, home: replacements.$HOME },
              );
        decision = decideOperation(input.mode, operation, config);
      } catch (error) {
        if (!(error instanceof PathResolutionError)) throw error;
        decision = pathResolutionDecision(input.mode);
      }
      assert.deepEqual(
        [decision.verdict, decision.ruleId],
        row.expect.public,
        row.id,
      );
      assert.deepEqual(
        decision.shadow === undefined
          ? null
          : [decision.shadow.verdict, decision.shadow.ruleId],
        row.expect.shadow,
        row.id,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a nested repository root remains a deletion boundary", () => {
  const root = mkdtempSync(join(homedir(), ".interlock-nested-repo-"));
  try {
    const outer = join(root, "outer");
    const nested = join(outer, "nested");
    setupGit({ repo: outer, branch: "feature" });
    setupGit({ repo: nested, branch: "feature" });
    const operation = normalizeToolCall(
      { toolName: "bash", input: { command: "rm -rf nested" } },
      { cwd: outer, home: join(root, "home") },
    );
    const config = loadConfig({
      agentDir: join(root, "agent"),
      home: join(root, "home"),
      processMode: "shield",
    });
    const decision = decideOperation("shield", operation, config);
    assert.deepEqual(
      [decision.verdict, decision.ruleId],
      ["ask", "delete.boundary"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generic secret-shaped basenames are ordinary unless configured", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  for (const path of ["/repo/.env", "/repo/key.pem", "/repo/secrets.yaml"])
    assert.equal(
      decideOperation(
        "shield",
        normalizeToolCall(
          { toolName: "read", input: { path } },
          { cwd: "/repo", home: "/users/owner" },
        ),
        config,
      ).verdict,
      "allow",
    );
});

test("every frozen shell verb denies a protected direct operand", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  for (const command of [
    "find /agent/keys -type f",
    "mkdir /agent/keys/new",
    "touch /agent/auth.json",
    "chmod 0600 /agent/auth.json",
    "chown owner /agent/auth.json",
  ]) {
    const decision = decideOperation(
      "shield",
      normalizeToolCall(
        { toolName: "bash", input: { command } },
        { cwd: "/repo", home: "/users/owner" },
      ),
      config,
    );
    assert.deepEqual(
      [decision.verdict, decision.ruleId],
      ["deny", "credential.direct-access"],
      command,
    );
  }
});

test("every recognized recursive root target is catastrophic", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  for (const call of [
    { toolName: "bash", input: { command: "find / -delete" } },
    { toolName: "delete", input: { path: "/", recursive: true } },
  ]) {
    const operation = normalizeToolCall(call, {
      cwd: "/repo",
      home: "/users/owner",
    });
    const decision = decideOperation("shield", operation, config);
    assert.deepEqual(
      [decision.verdict, decision.ruleId],
      ["deny", "catastrophic.root-recursive"],
      call.toolName,
    );
  }
});

test("catastrophic deletion wins across every compound-command shape", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  const operation = normalizeToolCall(
    { toolName: "bash", input: { command: "rm -rf ..; find / -delete" } },
    {
      cwd: "/repo/sub",
      home: "/users/owner",
      gitRunner: () => ({ ok: false, stdout: "" }),
    },
  );
  assert.deepEqual(decideOperation("shield", operation, config), {
    verdict: "deny",
    ruleId: "catastrophic.root-recursive",
    reason: "Recursive filesystem-root deletion is blocked.",
  });
});

test("credential-matching globs deny while ordinary project globs allow", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  for (const command of [
    "cat /users/owner/.ss?/id",
    "cat > /users/owner/.ss?/id",
  ]) {
    const decision = decideOperation(
      "shield",
      normalizeToolCall(
        { toolName: "bash", input: { command } },
        { cwd: "/repo", home: "/users/owner" },
      ),
      config,
    );
    assert.deepEqual(
      [decision.verdict, decision.ruleId],
      ["deny", "credential.direct-access"],
      command,
    );
  }
  for (const command of ["cat /repo/src/*.ts", "cat /users/owner/*/*"]) {
    const ordinary = decideOperation(
      "shield",
      normalizeToolCall(
        { toolName: "bash", input: { command } },
        { cwd: "/repo", home: "/users/owner" },
      ),
      config,
    );
    assert.deepEqual(
      [ordinary.verdict, ordinary.ruleId],
      ["allow", "default.allow"],
      command,
    );
  }
});

test("unsupported find options and expanded destructive forms default allow", () => {
  const config = loadConfig({
    agentDir: "/agent",
    home: "/users/owner",
    processMode: "shield",
  });
  for (const command of [
    "find -- build -delete",
    "dd of=/dev/$DEVICE",
    'git push origin "$SOURCE:main"',
  ]) {
    const operation = normalizeToolCall(
      { toolName: "bash", input: { command } },
      { cwd: "/repo", home: "/users/owner" },
    );
    const decision = decideOperation("shield", operation, config);
    assert.deepEqual(
      [decision.verdict, decision.ruleId],
      ["allow", "default.allow"],
      command,
    );
    assert.equal(operation.observations.length, 1, command);
  }
});

test("path-resolution failures have frozen mode semantics and reasons", () => {
  assert.deepEqual(pathResolutionDecision("off"), {
    verdict: "allow",
    ruleId: "default.allow",
    reason: "No seatbelt rule matched.",
  });
  assert.deepEqual(pathResolutionDecision("audit"), {
    verdict: "allow",
    ruleId: "default.allow",
    reason: "No seatbelt rule matched.",
    shadow: { verdict: "deny", ruleId: "path.resolution-failed" },
  });
  assert.deepEqual(pathResolutionDecision("shield"), {
    verdict: "deny",
    ruleId: "path.resolution-failed",
    reason: "Path resolution failed; the operation is blocked.",
  });
});
