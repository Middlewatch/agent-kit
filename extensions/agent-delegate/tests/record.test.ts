import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PARTIAL_OUTPUT_CAP_BYTES, pruneRecords, writeAssessment, writeRecord, type DelegationRecord } from "../src/record.ts";

const USAGE = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.01, turns: 3, contextTokens: 900 };

function sampleRecord(overrides: Partial<DelegationRecord> = {}): DelegationRecord {
  return {
    id: "child-1",
    label: "LTS research",
    startedAt: "2026-08-11T14:00:00.000Z",
    endedAt: "2026-08-11T14:05:00.000Z",
    durationMs: 300_000,
    profile: "research",
    model: "openai-codex/gpt-5.6-sol",
    capabilitySet: ["web_search", "web_fetch"],
    brief: "Find the current LTS.\nCite the primary source — `nodejs.org` only.",
    status: "completed",
    usage: USAGE,
    scanFindings: [],
    ...overrides,
  };
}

test("record written with brief verbatim", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-records-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const record = sampleRecord();
  writeRecord(dir, record);
  assert.deepEqual(readdirSync(dir), ["2026-08-11.jsonl"], "file named by the child's UTC start date");
  const lines = readFileSync(join(dir, "2026-08-11.jsonl"), "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 1);
  assert.equal((JSON.parse(lines[0]) as DelegationRecord).brief, record.brief);

  writeRecord(dir, sampleRecord({ id: "child-2" }));
  const appended = readFileSync(join(dir, "2026-08-11.jsonl"), "utf8").trimEnd().split("\n");
  assert.equal(appended.length, 2, "second record appends to the same UTC-date file");
});

test("prune removes older than 90 days and keeps newer", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-prune-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const now = new Date("2026-08-11T12:00:00.000Z");
  for (const name of ["2026-05-01.jsonl", "2026-05-13.jsonl", "2026-08-10.jsonl", "not-a-record.txt"]) {
    writeFileSync(join(dir, name), "{}\n");
  }
  // 2026-05-13 is exactly 90 days before 2026-08-11 → kept (only strictly older removed).
  // No maxAgeDays argument: this asserts the 90-day default itself.
  const removed = pruneRecords(dir, now);
  assert.equal(removed, 1);
  assert.deepEqual(readdirSync(dir).sort(), ["2026-05-13.jsonl", "2026-08-10.jsonl", "not-a-record.txt"]);

  assert.equal(pruneRecords(join(dir, "missing-subdir"), now), 0, "missing directory prunes nothing");
});

test("record carries validation outcome and capability set", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-records-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeRecord(dir, sampleRecord({
    status: "failed",
    failureCause: "schema validation failed",
    partialOutput: '{"finding": 42}',
    validation: { outcome: "failed", errors: ["/finding: Expected string"] },
    searchProviders: ["serper", "brave"],
    scanFindings: [{ class: "tool-direction", excerpt: "use the fetch tool for this" }],
  }));
  const stored = JSON.parse(readFileSync(join(dir, "2026-08-11.jsonl"), "utf8").trimEnd()) as DelegationRecord;
  assert.deepEqual(stored.capabilitySet, ["web_search", "web_fetch"]);
  assert.deepEqual(stored.validation, { outcome: "failed", errors: ["/finding: Expected string"] });
  assert.equal(stored.failureCause, "schema validation failed");
  assert.deepEqual(stored.searchProviders, ["serper", "brave"]);
  assert.equal(stored.scanFindings[0].class, "tool-direction");
});

test("partial output is bounded at 8 KiB by the writer", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-records-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeRecord(dir, sampleRecord({ status: "failed", failureCause: "timeout", partialOutput: "x".repeat(10_000) }));
  const stored = JSON.parse(readFileSync(join(dir, "2026-08-11.jsonl"), "utf8").trimEnd()) as DelegationRecord;
  assert.ok(stored.partialOutput !== undefined);
  assert.ok(
    Buffer.byteLength(stored.partialOutput, "utf8") <= PARTIAL_OUTPUT_CAP_BYTES,
    `${Buffer.byteLength(stored.partialOutput, "utf8")} bytes`,
  );
  assert.equal(PARTIAL_OUTPUT_CAP_BYTES, 8 * 1024);
});

test("successful output, digest, label, and root assessment are retained", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-records-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeRecord(dir, sampleRecord({ output: "grounded result" }));
  const assessment = writeAssessment(dir, "child-1", "used", "Changed the final diagnosis.", new Date("2026-08-11T16:00:00.000Z"));
  const rows = readFileSync(join(dir, "2026-08-11.jsonl"), "utf8").trimEnd().split("\n").map(JSON.parse);
  assert.equal(rows[0].label, "LTS research");
  assert.equal(rows[0].output, "grounded result");
  assert.match(rows[0].outputSha256, /^[a-f0-9]{64}$/);
  assert.equal(rows[1].kind, "assessment");
  assert.equal(rows[1].disposition, "used");
  assert.equal(assessment.delegationId, "child-1");
  assert.throws(() => writeAssessment(dir, "missing", "used", "not real"), /unknown delegation id/);
});

test("stored successful-output digest hashes the bounded stored artifact", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-records-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeRecord(dir, sampleRecord({ output: "x".repeat(30 * 1024) }));
  const row = JSON.parse(readFileSync(join(dir, "2026-08-11.jsonl"), "utf8"));
  assert.equal(row.outputSha256, createHash("sha256").update(row.output).digest("hex"));
  assert.ok(Buffer.byteLength(row.output, "utf8") <= 24 * 1024);
});
