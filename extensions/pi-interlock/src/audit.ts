import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeSync,
} from "node:fs";
import { join, parse, resolve, sep } from "node:path";

import {
  operationFacts,
  type AuditPathToken,
  type AuditRecord,
  type AuditRecordWithoutDigest,
  type AuditShape,
  type Decision,
  type EffectiveConfig,
  type NormalizedOperation,
} from "./contracts.ts";
import { pathPatternMayReach } from "./paths.ts";

const AUDIT_DIAGNOSTIC = "interlock: audit write failed" as const;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const BOUNDED_OBSERVATIONS = new Set([
  "git-state-unresolved",
  "unresolved-delete-target",
  "audit-degraded",
  "unsupported:shell",
  "unsupported:redirect",
  "unsupported:git",
  "unsupported:rm",
  "unsupported:find",
  "unsupported:read",
  "unsupported:write",
  "unsupported:edit",
  "unsupported:delete",
  "unsupported:bash",
  "unsupported:tool",
]);

export interface AuditTrailOptions {
  agentDir: string;
  config: EffectiveConfig;
  diagnostic?: (message: typeof AUDIT_DIAGNOSTIC) => void;
  failAppend?: boolean;
  now?: () => Date;
}

export interface AuditTestOptions {
  failAppend?: boolean;
  now?: () => Date;
}

function pathIsWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path);
  const normalizedRoot = resolve(root);
  if (normalizedPath === normalizedRoot) return true;
  const prefix =
    normalizedRoot === parse(normalizedRoot).root
      ? normalizedRoot
      : `${normalizedRoot}${sep}`;
  return normalizedPath.startsWith(prefix);
}

function credentialMatch(
  path: string,
  root: EffectiveConfig["credentialRoots"][number],
  unresolvedGlob: boolean,
): boolean {
  if (unresolvedGlob) return pathPatternMayReach(path, root.path, root.kind);
  return root.kind === "exact"
    ? path === root.path
    : pathIsWithin(path, root.path);
}

function pathToken(
  path: string,
  operation: NormalizedOperation,
  config: EffectiveConfig,
  unresolvedGlob = false,
): AuditPathToken {
  if (
    config.credentialRoots.some((root) =>
      credentialMatch(path, root, unresolvedGlob),
    )
  )
    return "@credential";
  const home = operation[operationFacts]?.home;
  if (home !== undefined && path === home) return "@home";
  if (config.estateRoots.some((root) => pathIsWithin(path, root)))
    return "@estate";
  if (config.ephemeralRoots.some((root) => pathIsWithin(path, root)))
    return "@ephemeral";
  if (pathIsWithin(path, operation.authorityRoot)) return "@authority";
  return "@outside";
}

function sourceClass(source: string): AuditShape["paths"][number]["source"] {
  if (source.startsWith("arg.") || source === "find.root") return "argument";
  if (source.startsWith("redirect.")) return "redirect";
  if (source.startsWith("patch.")) return "patch";
  if (source === "executable") return "executable";
  if (source === "tool.delete") return "tool";
  throw new Error("unsupported path source");
}

function recursiveDeleteSource(
  source: string,
): AuditShape["recursiveDeletes"][number]["source"] {
  if (source === "rm" || source === "find" || source === "tool.delete")
    return source;
  throw new Error("unsupported recursive-delete source");
}

function boundedObservation(observation: string): string {
  return BOUNDED_OBSERVATIONS.has(observation)
    ? observation
    : "unsupported:tool";
}

function protectedBranch(ref: string): boolean {
  const name = ref.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : ref;
  return name === "main" || name === "master";
}

export function redactOperation(
  operation: NormalizedOperation,
  config: EffectiveConfig,
): AuditShape {
  return {
    cwd: pathToken(operation.cwd, operation, config),
    authority: pathToken(operation.authorityRoot, operation, config),
    paths: operation.paths.map((access) => ({
      token: pathToken(
        access.path,
        operation,
        config,
        access.unresolvedGlob === true,
      ),
      access: access.access,
      source: sourceClass(access.source),
    })),
    recursiveDeletes: operation.recursiveDeletes.map((deletion) => ({
      literalTokens: deletion.targets.map((target) =>
        pathToken(target, operation, config),
      ),
      unresolvedCount: deletion.unresolvedTargets.length,
      source: recursiveDeleteSource(deletion.source),
    })),
    catastrophic: [...operation.catastrophic],
    pushes: operation.pushes.map((push) => ({
      remotePresent: push.remote !== undefined,
      refspecCount: push.refspecs.length,
      explicitProtectedDestination: push.destinations.some(protectedBranch),
      resolvedProtectedDestination:
        push.resolvedDestinations.some(protectedBranch),
      currentBranchProtected: protectedBranch(push.currentBranch ?? ""),
      force: push.force,
      bulk: push.bulk,
      stateResolved: push.stateResolved,
    })),
    observations: operation.observations.map(boundedObservation),
  };
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) =>
    character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function buildAuditRecord(
  timestamp: string,
  operation: NormalizedOperation,
  decision: Decision,
  config: EffectiveConfig,
): AuditRecord {
  const auditMode = config.mode === "audit";
  const withoutDigest: AuditRecordWithoutDigest = {
    schemaVersion: 2,
    timestamp,
    mode: auditMode ? "audit" : "shield",
    tool: operation.tool,
    shape: redactOperation(operation, config),
    publicVerdict: decision.verdict,
    publicRuleId: decision.ruleId,
    shadowVerdict: auditMode ? (decision.shadow?.verdict ?? null) : null,
    shadowRuleId: auditMode ? (decision.shadow?.ruleId ?? null) : null,
    enforcement: auditMode ? "shadow" : "enforced",
  };
  return {
    ...withoutDigest,
    digest: `sha256:${createHash("sha256")
      .update(canonicalJson(withoutDigest), "utf8")
      .digest("hex")}`,
  };
}

function appendOwnerOnly(path: string, timestamp: string, line: string): void {
  mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
  const directory = lstatSync(path);
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new Error("invalid audit directory");
  chmodSync(path, DIRECTORY_MODE);
  if ((lstatSync(path).mode & 0o777) !== DIRECTORY_MODE)
    throw new Error("invalid audit directory mode");

  const file = join(path, `decisions-${timestamp.slice(0, 10)}.ndjson`);
  const existing = lstatSync(file, { throwIfNoEntry: false });
  if (
    existing !== undefined &&
    (!existing.isFile() || existing.isSymbolicLink())
  )
    throw new Error("invalid audit file");
  const descriptor = openSync(
    file,
    constants.O_APPEND |
      constants.O_CREAT |
      constants.O_WRONLY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    FILE_MODE,
  );
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error("invalid audit file");
    fchmodSync(descriptor, FILE_MODE);
    if ((fstatSync(descriptor).mode & 0o777) !== FILE_MODE)
      throw new Error("invalid audit file mode");
    const bytes = Buffer.from(`${line}\n`, "utf8");
    if (writeSync(descriptor, bytes) !== bytes.length)
      throw new Error("incomplete audit append");
  } finally {
    closeSync(descriptor);
  }
}

export class AuditTrail {
  readonly #agentDir: string;
  readonly #config: EffectiveConfig;
  readonly #diagnostic: (message: typeof AUDIT_DIAGNOSTIC) => void;
  readonly #failAppend: boolean;
  readonly #now: () => Date;
  #degraded = false;

  constructor(options: AuditTrailOptions) {
    this.#agentDir = options.agentDir;
    this.#config = options.config;
    this.#diagnostic = options.diagnostic ?? (() => undefined);
    this.#failAppend = options.failAppend ?? false;
    this.#now = options.now ?? (() => new Date());
  }

  get degraded(): boolean {
    return this.#degraded;
  }

  record(operation: NormalizedOperation, decision: Decision): boolean {
    if (this.#config.mode === "off") return true;
    try {
      const timestamp = this.#now().toISOString();
      const record = buildAuditRecord(
        timestamp,
        operation,
        decision,
        this.#config,
      );
      if (this.#failAppend) throw new Error("injected audit failure");
      appendOwnerOnly(
        join(this.#agentDir, "var", "interlock"),
        timestamp,
        canonicalJson(record),
      );
      return true;
    } catch {
      this.#degraded = true;
      try {
        this.#diagnostic(AUDIT_DIAGNOSTIC);
      } catch {
        // Reporting must not change the already-computed public disposition.
      }
      return false;
    }
  }
}

export function auditTestOptions(
  environment: NodeJS.ProcessEnv,
): AuditTestOptions {
  if (environment.PI_INTERLOCK_TEST !== "1") return {};
  const result: AuditTestOptions = {};
  if (environment.AUDIT_FAILURE === "1") result.failAppend = true;
  const timestamp = environment.PI_INTERLOCK_TEST_AUDIT_TIMESTAMP;
  if (timestamp !== undefined) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.valueOf()) && parsed.toISOString() === timestamp)
      result.now = () => new Date(timestamp);
  }
  return result;
}
