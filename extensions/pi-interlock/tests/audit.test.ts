import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  AuditTrail,
  auditTestOptions,
  buildAuditRecord,
  canonicalJson,
  redactOperation,
} from "../src/audit.ts";
import {
  operationFacts,
  type Decision,
  type EffectiveConfig,
  type NormalizedOperation,
} from "../src/contracts.ts";

const FIXED_TIMESTAMP = "2026-08-14T12:34:56.000Z";
const ALLOW: Decision = {
  verdict: "allow",
  ruleId: "default.allow",
  reason: "The operation is allowed.",
};

function config(
  mode: EffectiveConfig["mode"],
  overrides: Partial<EffectiveConfig> = {},
): EffectiveConfig {
  return {
    mode,
    credentialRoots: [],
    estateRoots: [],
    ephemeralRoots: [],
    ...overrides,
  };
}

function ordinaryOperation(root: string, worker = "unit"): NormalizedOperation {
  return {
    tool: `tool-${worker}`,
    cwd: root,
    authorityRoot: root,
    paths: [],
    recursiveDeletes: [],
    catastrophic: [],
    pushes: [],
    observations: [],
    [operationFacts]: { home: join(root, "home"), repositoryRoots: [root] },
  };
}

function auditFile(agentDir: string): string {
  return join(agentDir, "var", "interlock", "decisions-2026-08-14.ndjson");
}

function verifyDigest(record: Record<string, unknown>): void {
  const { digest, ...withoutDigest } = record;
  const expected = `sha256:${createHash("sha256")
    .update(canonicalJson(withoutDigest), "utf8")
    .digest("hex")}`;
  assert.equal(digest, expected);
}

test("audit redaction applies the frozen token precedence and bounded shape", () => {
  const root = "/audit-unit";
  const operation: NormalizedOperation = {
    tool: "bash",
    cwd: `${root}/repo/sub`,
    authorityRoot: `${root}/repo`,
    paths: [
      {
        path: `${root}/agent/auth.json`,
        access: "read",
        source: "arg.path",
      },
      {
        path: `${root}/agent/auth.jso?`,
        access: "read",
        source: "arg.0",
        unresolvedGlob: true,
      },
      { path: `${root}/home`, access: "read", source: "redirect.in" },
      {
        path: `${root}/estate/project`,
        access: "edit",
        source: "patch.add",
      },
      {
        path: `${root}/tmp/work`,
        access: "create",
        source: "executable",
      },
      {
        path: `${root}/repo/build`,
        access: "delete",
        source: "tool.delete",
      },
      {
        path: `${root}/outside/value`,
        access: "unknown",
        source: "find.root",
      },
    ],
    recursiveDeletes: [
      {
        targets: [`${root}/estate/project`, `${root}/agent/auth.json`],
        unresolvedTargets: ["$TARGET", "$(secret)"],
        source: "rm",
      },
    ],
    catastrophic: ["catastrophic.root-recursive"],
    pushes: [
      {
        cwd: `${root}/repo`,
        remote: "origin",
        refspecs: ["feature:main", "topic:next"],
        destinations: ["refs/heads/main", "refs/heads/next"],
        resolvedDestinations: ["refs/heads/master"],
        force: true,
        bulk: "all",
        currentBranch: "main",
        stateResolved: false,
      },
    ],
    observations: ["git-state-unresolved", "unsupported:secret-token"],
    [operationFacts]: {
      home: `${root}/home`,
      repositoryRoots: [`${root}/repo`],
    },
  };
  const effective = config("audit", {
    credentialRoots: [
      {
        path: `${root}/agent/auth.json`,
        kind: "exact",
        ruleId: "credential.direct-access",
      },
    ],
    estateRoots: [`${root}/estate`],
    ephemeralRoots: [`${root}/tmp`],
  });

  assert.deepEqual(redactOperation(operation, effective), {
    cwd: "@authority",
    authority: "@authority",
    paths: [
      { token: "@credential", access: "read", source: "argument" },
      { token: "@credential", access: "read", source: "argument" },
      { token: "@home", access: "read", source: "redirect" },
      { token: "@estate", access: "edit", source: "patch" },
      { token: "@ephemeral", access: "create", source: "executable" },
      { token: "@authority", access: "delete", source: "tool" },
      { token: "@outside", access: "unknown", source: "argument" },
    ],
    recursiveDeletes: [
      {
        literalTokens: ["@estate", "@credential"],
        unresolvedCount: 2,
        source: "rm",
      },
    ],
    catastrophic: ["catastrophic.root-recursive"],
    pushes: [
      {
        remotePresent: true,
        refspecCount: 2,
        explicitProtectedDestination: true,
        resolvedProtectedDestination: true,
        currentBranchProtected: true,
        force: true,
        bulk: "all",
        stateResolved: false,
      },
    ],
    observations: ["git-state-unresolved", "unsupported:tool"],
  });

  const record = buildAuditRecord(
    FIXED_TIMESTAMP,
    operation,
    {
      verdict: "allow",
      ruleId: "default.allow",
      reason: "The operation is allowed.",
      shadow: { verdict: "deny", ruleId: "credential.direct-access" },
    },
    effective,
  );
  assert.equal(record.enforcement, "shadow");
  assert.equal(record.publicVerdict, "allow");
  assert.equal(record.shadowVerdict, "deny");
  assert.equal(record.shadowRuleId, "credential.direct-access");
  verifyDigest(record as unknown as Record<string, unknown>);
  const serialized = canonicalJson(record);
  for (const forbidden of [
    "/audit-unit",
    "auth.json",
    "$TARGET",
    "$(secret)",
    "origin",
    "feature",
    "secret-token",
  ])
    assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("canonical JSON sorts object keys by Unicode code point recursively", () => {
  assert.equal(
    canonicalJson({ z: { "\u{10000}": 2, "\uE000": 1 }, a: 0 }),
    '{"a":0,"z":{"":1,"𐀀":2}}',
  );
});

test("audit appends owner-only canonical NDJSON and never follows the final symlink", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "interlock-audit-unit-"));
  try {
    const agentDir = join(workspace, "agent");
    const root = join(workspace, "repo");
    mkdirSync(root, { recursive: true });
    const effective = config("shield");
    const diagnostics: string[] = [];
    const trail = new AuditTrail({
      agentDir,
      config: effective,
      now: () => new Date(FIXED_TIMESTAMP),
      diagnostic: (message) => diagnostics.push(message),
    });
    assert.equal(trail.record(ordinaryOperation(root), ALLOW), true);
    assert.equal(trail.record(ordinaryOperation(root), ALLOW), true);
    assert.equal(trail.degraded, false);
    assert.deepEqual(diagnostics, []);

    const file = auditFile(agentDir);
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    for (const line of lines) {
      assert.equal(line, canonicalJson(JSON.parse(line)));
      const record = JSON.parse(line) as Record<string, unknown>;
      assert.equal(record.enforcement, "enforced");
      assert.equal(record.shadowVerdict, null);
      verifyDigest(record);
    }
    assert.equal(
      statSync(join(agentDir, "var", "interlock")).mode & 0o777,
      0o700,
    );
    assert.equal(statSync(file).mode & 0o777, 0o600);

    const symlinkAgent = join(workspace, "symlink-agent");
    const auditDir = join(symlinkAgent, "var", "interlock");
    mkdirSync(auditDir, { recursive: true });
    chmodSync(auditDir, 0o700);
    const target = join(workspace, "target");
    writeFileSync(target, "unchanged\n", { mode: 0o600 });
    symlinkSync(target, auditFile(symlinkAgent));
    const symlinkDiagnostics: string[] = [];
    const symlinkTrail = new AuditTrail({
      agentDir: symlinkAgent,
      config: effective,
      now: () => new Date(FIXED_TIMESTAMP),
      diagnostic: (message) => symlinkDiagnostics.push(message),
    });
    assert.equal(symlinkTrail.record(ordinaryOperation(root), ALLOW), false);
    assert.equal(symlinkTrail.degraded, true);
    assert.deepEqual(symlinkDiagnostics, ["interlock: audit write failed"]);
    assert.equal(readFileSync(target, "utf8"), "unchanged\n");
    assert.equal(lstatSync(auditFile(symlinkAgent)).isSymbolicLink(), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a FIFO final path degrades promptly without blocking the hook", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "interlock-audit-fifo-"));
  try {
    const agentDir = join(workspace, "agent");
    const directory = join(agentDir, "var", "interlock");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    execFileSync("mkfifo", [auditFile(agentDir)]);
    const moduleUrl = pathToFileURL(
      join(import.meta.dirname, "..", "src", "audit.ts"),
    ).href;
    const script = `
      import { AuditTrail } from ${JSON.stringify(moduleUrl)};
      const diagnostics = [];
      const root = process.env.AUDIT_ROOT;
      const trail = new AuditTrail({
        agentDir: process.env.AUDIT_AGENT,
        config: { mode: "shield", credentialRoots: [], estateRoots: [], ephemeralRoots: [] },
        now: () => new Date(${JSON.stringify(FIXED_TIMESTAMP)}),
        diagnostic: (message) => diagnostics.push(message),
      });
      const result = trail.record({
        tool: "bash", cwd: root, authorityRoot: root, paths: [], recursiveDeletes: [],
        catastrophic: [], pushes: [], observations: [],
      }, { verdict: "allow", ruleId: "default.allow", reason: "ok" });
      process.stdout.write(JSON.stringify({ result, degraded: trail.degraded, diagnostics }));
    `;
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", script],
      {
        env: {
          ...process.env,
          AUDIT_AGENT: agentDir,
          AUDIT_ROOT: workspace,
        },
        encoding: "utf8",
        timeout: 2_000,
      },
    );
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      result: false,
      degraded: true,
      diagnostics: ["interlock: audit write failed"],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("audit failure is value-free, degraded, and policy-neutral", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "interlock-audit-failure-"));
  try {
    const diagnostics: string[] = [];
    const trail = new AuditTrail({
      agentDir: join(workspace, "agent"),
      config: config("audit"),
      now: () => new Date(FIXED_TIMESTAMP),
      failAppend: true,
      diagnostic: (message) => diagnostics.push(message),
    });
    const decision: Decision = {
      ...ALLOW,
      shadow: { verdict: "deny", ruleId: "credential.direct-access" },
    };
    assert.equal(trail.record(ordinaryOperation(workspace), decision), false);
    assert.equal(trail.degraded, true);
    assert.deepEqual(diagnostics, ["interlock: audit write failed"]);
    assert.deepEqual(decision, {
      ...ALLOW,
      shadow: { verdict: "deny", ruleId: "credential.direct-access" },
    });
    assert.equal(
      lstatSync(join(workspace, "agent"), { throwIfNoEntry: false }),
      undefined,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a throwing diagnostic sink cannot escape audit failure", async () => {
  const workspace = await mkdtemp(
    join(tmpdir(), "interlock-audit-diagnostic-"),
  );
  try {
    const trail = new AuditTrail({
      agentDir: join(workspace, "agent"),
      config: config("shield"),
      failAppend: true,
      diagnostic: () => {
        throw new Error("diagnostic sink failed");
      },
    });
    assert.equal(trail.record(ordinaryOperation(workspace), ALLOW), false);
    assert.equal(trail.degraded, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("audit test seams are inert without the explicit marker", () => {
  assert.deepEqual(
    auditTestOptions({
      AUDIT_FAILURE: "1",
      PI_INTERLOCK_TEST_AUDIT_TIMESTAMP: FIXED_TIMESTAMP,
    }),
    {},
  );
  const active = auditTestOptions({
    PI_INTERLOCK_TEST: "1",
    AUDIT_FAILURE: "1",
    PI_INTERLOCK_TEST_AUDIT_TIMESTAMP: FIXED_TIMESTAMP,
  });
  assert.equal(active.failAppend, true);
  assert.equal(active.now?.().toISOString(), FIXED_TIMESTAMP);
});

test(
  "concurrent audit writers preserve one parseable record per append",
  { timeout: 20_000 },
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), "interlock-audit-race-"));
    try {
      const agentDir = join(workspace, "agent");
      const moduleUrl = pathToFileURL(
        join(import.meta.dirname, "..", "src", "audit.ts"),
      ).href;
      const script = `
        import { AuditTrail } from ${JSON.stringify(moduleUrl)};
        import { operationFacts } from ${JSON.stringify(
          pathToFileURL(join(import.meta.dirname, "..", "src", "contracts.ts"))
            .href,
        )};
        const agentDir = process.env.AUDIT_AGENT;
        const worker = process.env.AUDIT_WORKER;
        const root = process.env.AUDIT_ROOT;
        const trail = new AuditTrail({
          agentDir,
          config: { mode: "shield", credentialRoots: [], estateRoots: [], ephemeralRoots: [] },
          now: () => new Date(${JSON.stringify(FIXED_TIMESTAMP)}),
        });
        for (let index = 0; index < 20; index += 1) {
          const operation = {
            tool: \`worker-\${worker}-\${index}\`, cwd: root, authorityRoot: root,
            paths: [], recursiveDeletes: [], catastrophic: [], pushes: [], observations: [],
            [operationFacts]: { home: root, repositoryRoots: [root] },
          };
          if (!trail.record(operation, { verdict: "allow", ruleId: "default.allow", reason: "ok" }))
            process.exit(2);
        }
      `;
      const workers = Array.from(
        { length: 6 },
        (_, index) =>
          new Promise<void>((resolveWorker, rejectWorker) => {
            const child = spawn(
              process.execPath,
              [
                "--experimental-strip-types",
                "--input-type=module",
                "--eval",
                script,
              ],
              {
                env: {
                  ...process.env,
                  AUDIT_AGENT: agentDir,
                  AUDIT_ROOT: workspace,
                  AUDIT_WORKER: String(index),
                },
                stdio: ["ignore", "ignore", "pipe"],
              },
            );
            let stderr = "";
            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk: string) => {
              stderr += chunk;
            });
            child.on("error", rejectWorker);
            child.on("exit", (code) => {
              if (code === 0) resolveWorker();
              else
                rejectWorker(
                  new Error(`worker ${index} exited ${code}: ${stderr}`),
                );
            });
          }),
      );
      await Promise.all(workers);

      const lines = readFileSync(auditFile(agentDir), "utf8")
        .trimEnd()
        .split("\n");
      assert.equal(lines.length, 120);
      assert.equal(
        new Set(lines.map((line) => JSON.parse(line).tool)).size,
        120,
      );
      for (const line of lines) verifyDigest(JSON.parse(line));
      assert.equal(statSync(auditFile(agentDir)).mode & 0o777, 0o600);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
