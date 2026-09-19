/**
 * Delegation records: one JSONL line per child under
 * `~/.local/state/agent-delegate/records/<UTC start date>.jsonl`, local-only,
 * pruned past 90 days at session_start. Records carry the brief verbatim,
 * profile, resolved capability set, accounting, and validation outcome.
 *
 * A return too large for the model-visible result, and the raw output of a
 * typed return that failed validation, are written whole to
 * `records/returns/<UTC start date>-<id>.<ext>` and pruned on the same clock.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { truncateUtf8 } from "./protocol.ts";
import type { ScanFinding } from "./scan.ts";
import type { ThinkingLevel } from "./tiers.ts";

export const PARTIAL_OUTPUT_CAP_BYTES = 8 * 1024;

// Shared terminal-state and accounting types; index.ts imports these.
export type DelegateStatus = "starting" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
  contextTokens: number;
}
// Matches the src/web.ts export; kept local so the record contract module
// does not depend on the child-side web module.
export type SearchProviderName = "serper" | "brave" | "tavily";

export interface DelegationRecord {
  kind?: "delegation";
  id: string;
  label: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  profile: "explore" | "review" | "research";
  agent?: string;
  tier?: "scout" | "analyst" | "judge";
  thinking?: ThinkingLevel; // absent from records written before reasoning was persisted
  model: string;
  scope?: string; // first scope, kept for older record readers
  scopes?: string[]; // full delegated read-scope list in resolution order
  capabilitySet: string[];
  brief: string;
  resultSchema?: object;
  status: DelegateStatus;
  usage: Usage;
  failureCause?: string; // set on every terminal failure path
  partialOutput?: string; // ≤8 KiB rolling assistant transcript on failure paths
  output?: string; // bounded successful return artifact
  outputSha256?: string;
  returnFile?: string; // full return on disk: an over-inline-limit success or a failed typed return's raw output
  validation?: { outcome: "valid" | "failed"; errors?: string[] };
  loop?: { kind: "cycle" | "error-streak"; detail: string };
  searchProviders?: SearchProviderName[];
  writer?: {
    branch: string;
    worktreePath: string;
    repoRoot: string;
    baseCommit: string;
    commits: string[];
    diffstat: string;
    dirty: boolean;
    removed: boolean;
    error?: string;
  };
  scanFindings: ScanFinding[];
  provenance?: unknown[];
  unmatchedCitations?: unknown[];
}

export type DelegationDisposition = "used" | "corrected" | "discarded";

export interface DelegationAssessmentRecord {
  kind: "assessment";
  id: string;
  delegationId: string;
  assessedAt: string;
  disposition: DelegationDisposition;
  reason: string;
}

const RECORD_FILE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/;
const RETURNS_SUBDIR = "returns";
const RETURN_FILE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-.+\.(json|txt)$/;

/** Write one child's full return under `<dir>/returns/` and give back its path. */
export function writeReturnFile(dir: string, startedAt: string, id: string, extension: "json" | "txt", text: string): string {
  const returnsDir = join(dir, RETURNS_SUBDIR);
  mkdirSync(returnsDir, { recursive: true });
  const path = join(returnsDir, `${new Date(startedAt).toISOString().slice(0, 10)}-${id}.${extension}`);
  writeFileSync(path, text, "utf8");
  return path;
}

/**
 * Append one record to `<dir>/<UTC start date>.jsonl`, creating the
 * directory as needed. The writer enforces the record contract's
 * `partialOutput` bound itself: values over 8 KiB are truncated on a
 * UTF-8 boundary regardless of caller discipline.
 */
export function writeRecord(dir: string, record: DelegationRecord): void {
  mkdirSync(dir, { recursive: true });
  const boundedOutput = record.output === undefined
    ? {}
    : (() => {
        const output = truncateUtf8(record.output, 24 * 1024, "\n[delegate output truncated]").text;
        return { output, outputSha256: createHash("sha256").update(output).digest("hex") };
      })();
  const bounded: DelegationRecord =
    record.partialOutput !== undefined
      ? { ...record, ...boundedOutput, partialOutput: truncateUtf8(record.partialOutput, PARTIAL_OUTPUT_CAP_BYTES, "…").text }
      : { ...record, ...boundedOutput };
  const utcStartDate = new Date(record.startedAt).toISOString().slice(0, 10);
  appendFileSync(join(dir, `${utcStartDate}.jsonl`), `${JSON.stringify(bounded)}\n`, "utf8");
}

export function writeAssessment(
  dir: string,
  delegationId: string,
  disposition: DelegationDisposition,
  reason: string,
  now = new Date(),
): DelegationAssessmentRecord {
  mkdirSync(dir, { recursive: true });
  const found = readdirSync(dir).some((name) => {
    if (!RECORD_FILE_PATTERN.test(name)) return false;
    return readFileSync(join(dir, name), "utf8").split("\n").some((line) => {
      if (!line.trim()) return false;
      try {
        const row = JSON.parse(line) as { kind?: string; id?: string };
        return row.kind !== "assessment" && row.id === delegationId;
      } catch {
        return false;
      }
    });
  });
  if (!found) throw new Error(`unknown delegation id: ${delegationId}`);
  const assessment: DelegationAssessmentRecord = {
    kind: "assessment",
    id: randomUUID(),
    delegationId,
    assessedAt: now.toISOString(),
    disposition,
    reason: truncateUtf8(reason.trim(), 1000, "…").text,
  };
  appendFileSync(join(dir, `${assessment.assessedAt.slice(0, 10)}.jsonl`), `${JSON.stringify(assessment)}\n`, "utf8");
  return assessment;
}

/**
 * Remove record files whose `YYYY-MM-DD` name, parsed as a UTC calendar
 * date, is older than maxAgeDays relative to `now`, and return files under
 * `returns/` on the same rule. Returns files removed.
 */
export function pruneRecords(dir: string, now: Date, maxAgeDays = 90): number {
  return pruneDated(dir, RECORD_FILE_PATTERN, now, maxAgeDays) + pruneDated(join(dir, RETURNS_SUBDIR), RETURN_FILE_PATTERN, now, maxAgeDays);
}

function pruneDated(dir: string, pattern: RegExp, now: Date, maxAgeDays: number): number {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0; // no such directory yet — nothing to prune
  }
  // Calendar-date comparison: the file name is a UTC calendar date, so the
  // cutoff is now's UTC calendar date minus maxAgeDays (a file exactly at
  // the bound is kept; only strictly older files are removed).
  const cutoffMs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (!match) continue;
    const fileDateMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (fileDateMs < cutoffMs) {
      rmSync(join(dir, entry));
      removed += 1;
    }
  }
  return removed;
}
