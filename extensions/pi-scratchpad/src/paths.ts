import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";

/** Age at which an idle session directory becomes reapable. */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ScratchpadEnv {
  PI_SCRATCHPAD_BASE?: string;
  PI_SCRATCHPAD_TTL_DAYS?: string;
  XDG_CACHE_HOME?: string;
  HOME?: string;
}

export class ScratchpadPathError extends Error {}

/**
 * Root under which every project's scratch directories live.
 *
 * Defaults to `~/.cache/pi-scratchpad` rather than `/tmp`: scratch output is
 * expected to be large, and `/tmp` is a RAM-backed tmpfs on many systems.
 */
export function resolveBase(env: ScratchpadEnv = process.env): string {
  const explicit = env.PI_SCRATCHPAD_BASE?.trim();
  if (explicit) {
    if (!isAbsolute(explicit)) {
      throw new ScratchpadPathError(`PI_SCRATCHPAD_BASE must be absolute, got: ${explicit}`);
    }
    return resolve(explicit);
  }
  const cache = env.XDG_CACHE_HOME?.trim();
  if (cache && isAbsolute(cache)) return resolve(cache, "pi-scratchpad");
  return resolve(env.HOME?.trim() || homedir(), ".cache", "pi-scratchpad");
}

/**
 * Turn an absolute working directory into a single path segment.
 *
 * Matches Claude Code's convention (`/users/owner/projects/evoker` becomes
 * `-users-owner-projects-evoker`) so that a human reading either harness's
 * scratch tree recognizes the layout.
 */
export function projectSlug(cwd: string): string {
  if (!isAbsolute(cwd)) {
    throw new ScratchpadPathError(`cwd must be absolute, got: ${cwd}`);
  }
  const normalized = resolve(cwd);
  const slug = normalized.split(sep).join("-");
  return slug === "-" ? "-root" : slug;
}

/**
 * Reject session ids that could escape the base directory. The id arrives from
 * the harness rather than the model, but it lands in a filesystem path, so it
 * is validated at the boundary regardless.
 */
export function assertSafeSessionId(sessionId: string): string {
  const id = sessionId.trim();
  if (!id) throw new ScratchpadPathError("session id must not be empty");
  if (id === "." || id === "..") throw new ScratchpadPathError(`unsafe session id: ${id}`);
  if (/[\\/\0]/.test(id)) throw new ScratchpadPathError(`session id must not contain a path separator: ${sessionId}`);
  return id;
}

/**
 * The per-session scratch directory. Session-scoped rather than project-scoped:
 * concurrent agents in one repo are normal here, and a shared directory would
 * reintroduce the collision the one-writer rule exists to prevent.
 */
export function sessionScratchpad(
  cwd: string,
  sessionId: string,
  env: ScratchpadEnv = process.env,
): string {
  return resolve(resolveBase(env), projectSlug(cwd), assertSafeSessionId(sessionId), "scratchpad");
}

/**
 * Reap age in milliseconds. `PI_SCRATCHPAD_TTL_DAYS=0` disables sweeping;
 * an unparseable or negative value falls back to the default rather than
 * being read as "reap everything now".
 */
export function resolveTtlMs(env: ScratchpadEnv = process.env): number {
  const raw = env.PI_SCRATCHPAD_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_TTL_MS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) return DEFAULT_TTL_MS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Whether an idle session directory is old enough to reap. Callers pass the
 * directory mtime; writing to the scratchpad refreshes it, so an active
 * session is never expired out from under itself.
 */
export function isExpired(mtimeMs: number, now: number, ttlMs: number = DEFAULT_TTL_MS): boolean {
  if (!Number.isFinite(mtimeMs) || !Number.isFinite(now)) return false;
  return now - mtimeMs > ttlMs;
}
