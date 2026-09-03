import { chmod, lstat, mkdir, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ScratchpadEnv,
  resolveBase,
  resolveTtlMs,
  isExpired,
  sessionScratchpad,
} from "./paths.ts";

/** Marker written beside a scratchpad naming the pi process that owns it. */
export const OWNER_FILE = ".owner";

/** Guard rails for the deep freshness scan, so one huge tree cannot stall a sweep. */
const SCAN_MAX_DEPTH = 8;
const SCAN_MAX_ENTRIES = 5000;

/**
 * Create (or confirm) this session's scratch directory and hand back its path.
 *
 * Mode 0700 because scratch output routinely contains repo contents, command
 * output, and anything else the agent was working with. `mkdir` only applies
 * its mode to directories it creates, so pre-existing components are chmod-ed
 * explicitly rather than trusted.
 */
export async function ensureScratchpad(
  cwd: string,
  sessionId: string,
  env: ScratchpadEnv = process.env,
): Promise<string> {
  const dir = sessionScratchpad(cwd, sessionId, env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {});
  await chmod(dirname(dir), 0o700).catch(() => {});
  await claimOwnership(dir).catch(() => {});
  return dir;
}

/**
 * Record the owning process id next to the scratchpad. A sweeper skips any
 * session whose owner is still running, which is what protects a session that
 * has been open and idle for longer than the TTL.
 */
async function claimOwnership(scratchpad: string): Promise<void> {
  await writeFile(join(dirname(scratchpad), OWNER_FILE), `${process.pid}\n`, { mode: 0o600 });
}

/** Release the ownership claim so the directory becomes reapable again. */
export async function releaseOwnership(scratchpad: string): Promise<void> {
  await unlink(join(dirname(scratchpad), OWNER_FILE)).catch(() => {});
}

export interface SweepResult {
  /** Session directories removed. */
  removed: string[];
  /** Session directories left in place. */
  kept: number;
  /** Paths that could not be inspected or removed, with the reason. */
  failed: Array<{ path: string; reason: string }>;
}

export interface SweepOptions {
  /** Root holding `<project-slug>/<session-id>/scratchpad`. */
  base: string;
  /** A scratchpad path that must survive — normally the live session's. */
  keep?: string;
  now?: number;
  ttlMs?: number;
  /** Override the liveness check. Defaults to "is this pid running?". */
  isProcessAlive?: (pid: number) => boolean;
}

/**
 * Delete session directories that have been idle past the TTL.
 *
 * Runs opportunistically when a session resolves its own path: no timer, no
 * daemon, and nothing to install. A TTL of 0 disables the sweep entirely.
 *
 * Every decision here fails towards keeping data. A candidate is removed only
 * when it has the exact shape this extension creates (`<base>/<project>/<session>/scratchpad`),
 * is not claimed by a running process, and contains nothing modified inside the
 * TTL at any depth.
 */
export async function sweepExpired(options: SweepOptions): Promise<SweepResult> {
  const { base, keep } = options;
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? resolveTtlMs();
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const result: SweepResult = { removed: [], kept: 0, failed: [] };
  if (ttlMs <= 0) return result;

  const keepSessionDir = keep ? dirname(keep) : undefined;
  for (const projectSlug of await listDirectories(base, result)) {
    const projectDir = join(base, projectSlug);
    for (const sessionId of await listDirectories(projectDir, result)) {
      const sessionDir = join(projectDir, sessionId);
      try {
        if (sessionDir === keepSessionDir || !(await isReapable(sessionDir, now, ttlMs, isProcessAlive))) {
          result.kept++;
          continue;
        }
        await rm(sessionDir, { recursive: true, force: true });
        result.removed.push(sessionDir);
      } catch (err) {
        result.failed.push({ path: sessionDir, reason: reasonOf(err) });
      }
    }
    // A project whose sessions have all been reaped leaves an empty shell.
    await rmdir(projectDir).catch(() => {});
  }
  return result;
}

/**
 * Whether a candidate directory is one of ours, unclaimed, and idle.
 *
 * The `scratchpad` child is the ownership test: it is what this extension
 * creates and nothing else in a two-level tree would have it. Without it a
 * `PI_SCRATCHPAD_BASE` pointed at a populated directory — a home directory, a
 * repository — would make every `<base>/<a>/<b>` a deletion candidate.
 */
async function isReapable(
  sessionDir: string,
  now: number,
  ttlMs: number,
  isProcessAlive: (pid: number) => boolean,
): Promise<boolean> {
  const scratchpad = join(sessionDir, "scratchpad");
  try {
    if (!(await lstat(scratchpad)).isDirectory()) return false;
  } catch {
    return false;
  }
  if (await isClaimedByLiveProcess(sessionDir, isProcessAlive)) return false;
  // Fast path: a directory touched recently is not worth walking.
  if (!isExpired(await mtimeOf(sessionDir), now, ttlMs)) return false;
  return !(await hasActivitySince(sessionDir, now - ttlMs));
}

async function isClaimedByLiveProcess(
  sessionDir: string,
  isProcessAlive: (pid: number) => boolean,
): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(join(sessionDir, OWNER_FILE), "utf8");
  } catch {
    return false;
  }
  const pid = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return isProcessAlive(pid);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else: still alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Whether anything under `dir` was modified at or after `cutoffMs`.
 *
 * Walks depth-first and stops at the first sign of life. Directory mtime alone
 * is not enough: appending to `scratchpad/logs/gate.log` bumps no parent's
 * mtime, so a session writing steadily into a subdirectory would look idle.
 * A tree too large or too deep to scan is reported as active, because the cost
 * of guessing wrong in the other direction is someone's data.
 */
async function hasActivitySince(dir: string, cutoffMs: number): Promise<boolean> {
  let budget = SCAN_MAX_ENTRIES;

  const walk = async (path: string, depth: number): Promise<boolean> => {
    if (depth > SCAN_MAX_DEPTH) return true;
    let entries: string[];
    try {
      entries = await readdir(path);
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (--budget <= 0) return true;
      const child = join(path, entry);
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(child);
      } catch {
        continue;
      }
      if (info.mtimeMs >= cutoffMs) return true;
      if (info.isDirectory() && (await walk(child, depth + 1))) return true;
    }
    return false;
  };

  return walk(dir, 0);
}

/**
 * Drop this session's directory if it was never written to, so that merely
 * starting pi does not litter the cache with empty trees. Anything with
 * content is left for the sweeper. Returns whether the tree is now gone.
 */
export async function pruneIfEmpty(scratchpad: string): Promise<boolean> {
  try {
    const entries = await readdir(scratchpad);
    if (entries.length > 0) return false;
  } catch {
    return false;
  }
  await releaseOwnership(scratchpad);
  try {
    await rmdir(scratchpad);
  } catch {
    return false;
  }
  const sessionDir = dirname(scratchpad);
  // Siblings and concurrent sessions keep these; ENOTEMPTY is the expected case.
  await rmdir(sessionDir).catch(() => {});
  await rmdir(dirname(sessionDir)).catch(() => {});
  return true;
}

/** Convenience wrapper: the base this environment resolves to. */
export function baseFor(env: ScratchpadEnv = process.env): string {
  return resolveBase(env);
}

async function mtimeOf(path: string): Promise<number> {
  return (await stat(path)).mtimeMs;
}

/** Immediate subdirectories, skipping symlinks so a sweep cannot follow one out of the base. */
async function listDirectories(parent: string, result: SweepResult): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(parent);
  } catch (err) {
    if (!isMissing(err)) result.failed.push({ path: parent, reason: reasonOf(err) });
    return [];
  }
  const directories: string[] = [];
  for (const entry of entries) {
    const path = join(parent, entry);
    try {
      if ((await lstat(path)).isDirectory()) directories.push(entry);
    } catch (err) {
      if (!isMissing(err)) result.failed.push({ path, reason: reasonOf(err) });
    }
  }
  return directories;
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
