import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { normalizeToolCall } from "../src/adapters.ts";
import { AuditTrail } from "../src/audit.ts";
import { loadConfig } from "../src/config.ts";
import { decideOperation } from "../src/policy.ts";

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function nearestRank(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)]!;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function childDuration(source: string): number {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", source],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    },
  );
  if (result.status !== 0)
    throw new Error(`startup sample failed: ${result.stderr.trim()}`);
  return performance.now() - started;
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "pi-interlock-costs-"));
try {
  const startupRuns = 7;
  const baselineStartup: number[] = [];
  const extensionStartup: number[] = [];
  const entry = new URL("../index.ts", import.meta.url).href;
  for (let index = 0; index < startupRuns; index += 1) {
    baselineStartup.push(childDuration("void 0"));
    extensionStartup.push(
      childDuration(`await import(${JSON.stringify(entry)})`),
    );
  }

  const home = homedir();
  const agentDir = join(temporaryRoot, "agent");
  const shield = loadConfig({
    agentDir,
    home,
    processMode: "shield",
  });
  const call = { toolName: "read", input: { path: "README.md" } } as const;
  const normalizeEnvironment = {
    cwd: process.cwd(),
    home,
    tmpdir: tmpdir(),
  };
  normalizeToolCall(call, normalizeEnvironment);
  const batches = 20;
  const callsPerBatch = 25;
  const perCallMicroseconds: number[] = [];
  let operation = normalizeToolCall(call, normalizeEnvironment);
  for (let batch = 0; batch < batches; batch += 1) {
    const started = performance.now();
    for (let index = 0; index < callsPerBatch; index += 1) {
      operation = normalizeToolCall(call, normalizeEnvironment);
      decideOperation("shield", operation, shield);
    }
    perCallMicroseconds.push(
      ((performance.now() - started) * 1_000) / callsPerBatch,
    );
  }

  const audit = loadConfig({ agentDir, home, processMode: "audit" });
  const auditTrail = new AuditTrail({
    agentDir,
    config: audit,
    now: () => new Date("2026-08-14T00:00:00.000Z"),
  });
  const auditDecision = decideOperation("audit", operation, audit);
  const auditRecords = 500;
  for (let index = 0; index < auditRecords; index += 1)
    auditTrail.record(operation, auditDecision);
  const auditDirectory = join(agentDir, "var", "interlock");
  const auditFiles = readdirSync(auditDirectory);
  if (auditFiles.length !== 1) throw new Error("unexpected audit file count");
  const auditBytes = statSync(join(auditDirectory, auditFiles[0]!)).size;

  const baselineMedian = median(baselineStartup);
  const extensionMedian = median(extensionStartup);
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      node: process.version,
      startup: {
        definition: "cold Node process plus TypeScript extension import",
        runs: startupRuns,
        baselineMedianMs: round(baselineMedian),
        extensionMedianMs: round(extensionMedian),
        incrementalMedianMs: round(extensionMedian - baselineMedian),
      },
      perCall: {
        definition:
          "production normalize plus shield decision for an ordinary read in the repository",
        calls: batches * callsPerBatch,
        batches,
        medianMicroseconds: round(median(perCallMicroseconds)),
        p95BatchMicroseconds: round(nearestRank(perCallMicroseconds, 0.95)),
      },
      auditGrowth: {
        definition:
          "production audit append for the same redacted ordinary read shape",
        records: auditRecords,
        bytes: auditBytes,
        bytesPerRecord: round(auditBytes / auditRecords),
      },
      thresholds: null,
    })}\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
