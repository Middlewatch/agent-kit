import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const BLOCKED_SEGMENTS = new Set([
  ".aws",
  ".azure",
  ".claude",
  ".codex",
  ".docker",
  ".git",
  ".gnupg",
  ".kube",
  ".pi",
  ".ssh",
  ".terraform.d",
]);
const SAFE_ENV_SUFFIXES = [".example", ".sample", ".template"];
const SECRET_FILE_NAMES = new Set([".netrc", ".npmrc", ".pypirc", "id_ed25519", "id_rsa"]);
const SECRET_SUFFIXES = [".key", ".p12", ".pem", ".pfx"];

export interface PathDecision {
  allowed: boolean;
  path?: string;
  reason?: string;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function canonicalizeFuturePath(path: string): string {
  let cursor = path;
  const missing: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(basename(cursor));
    cursor = parent;
  }
  const existing = realpathSync(cursor);
  return resolve(existing, ...missing);
}

function secretReason(candidate: string): string | undefined {
  const segments = resolve(candidate).split(sep).filter(Boolean);
  for (const rawSegment of segments) {
    const name = rawSegment.toLowerCase();
    if (BLOCKED_SEGMENTS.has(name)) return `path enters blocked ${rawSegment} metadata or credential directory`;
    if (SECRET_FILE_NAMES.has(name)) return `path contains a commonly credential-bearing name (${rawSegment})`;
    if (SECRET_SUFFIXES.some((suffix) => name.endsWith(suffix))) return `path contains a secret-bearing suffix (${rawSegment})`;
    if (name === ".env" || (name.startsWith(".env.") && !SAFE_ENV_SUFFIXES.some((suffix) => name.endsWith(suffix)))) {
      return `path contains an environment-secret name (${rawSegment})`;
    }
  }
  return undefined;
}

export interface ResolveScopeOptions {
  required?: boolean;
  homeDirectory?: string;
}

export function resolveScope(cwd: string, requested: string | undefined, options?: ResolveScopeOptions): PathDecision {
  const required = options?.required ?? true;
  const homeDirectory = options?.homeDirectory ?? homedir();
  if (requested === undefined) {
    if (required) return { allowed: false, reason: "this delegate profile requires a scope directory" };
    return { allowed: true };
  }
  try {
    const cwdRoot = realpathSync(cwd);
    const home = realpathSync(homeDirectory);
    const value = requested.trim() || ".";
    const unadorned = value.replace(/^@/, "");
    const lexical = unadorned === "~"
      ? home
      : unadorned.startsWith(`~${sep}`)
        ? resolve(home, unadorned.slice(2))
        : resolve(cwdRoot, unadorned);
    const scopeRoot = realpathSync(lexical);
    if (!statSync(scopeRoot).isDirectory()) return { allowed: false, reason: "scope is not a directory" };
    if (scopeRoot === home || scopeRoot === resolve("/")) {
      return { allowed: false, reason: "delegation scope must be narrower than the home directory or filesystem root" };
    }
    const cwdCanContainScope = cwdRoot !== resolve("/") && isInside(cwdRoot, scopeRoot);
    if (!isInside(home, scopeRoot) && !cwdCanContainScope) {
      return { allowed: false, reason: "scope must lie beneath the home directory or beneath Pi's working directory" };
    }
    if (isInside(home, scopeRoot)) {
      const homeSegments = relative(home, scopeRoot).split(sep).filter(Boolean);
      if (homeSegments[0]?.startsWith(".")) {
        return { allowed: false, reason: `delegation cannot mount hidden home tree home/${homeSegments[0]}` };
      }
    }
    const secret = secretReason(scopeRoot);
    if (secret) return { allowed: false, reason: secret };
    return { allowed: true, path: scopeRoot };
  } catch (error) {
    return { allowed: false, reason: `scope cannot be resolved: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface ScopeDispatch {
  root: string;
  path: string;
}

/**
 * Route one child path across delegated scopes: relative paths resolve
 * against the first scope; absolute paths must land lexically inside one of
 * the scopes and are re-expressed relative to it. Canonical (symlink and
 * secret) checks still run in resolveReadablePath against the chosen root.
 */
export function dispatchAcrossScopes(roots: readonly string[], requested: unknown): ScopeDispatch {
  if (roots.length === 0) throw new Error("no delegated scopes");
  const value = typeof requested === "string" && requested.trim() ? requested.trim().replace(/^@/, "") : ".";
  if (!isAbsolute(value)) return { root: roots[0], path: value };
  const lexical = resolve(value);
  for (const root of roots) {
    if (isInside(root, lexical)) return { root, path: relative(root, lexical) || "." };
  }
  throw new Error(`absolute path lies outside every delegated scope: ${value}`);
}

export function resolveReadablePath(scopeRoot: string, requested: unknown): PathDecision {
  try {
    const root = realpathSync(scopeRoot);
    const value = typeof requested === "string" && requested.trim() ? requested.trim().replace(/^@/, "") : ".";
    const lexical = resolve(root, value);
    const canonical = canonicalizeFuturePath(lexical);
    if (!isInside(root, canonical)) return { allowed: false, reason: "path escapes the delegated scope" };
    const secret = secretReason(canonical);
    if (secret) return { allowed: false, reason: secret };
    return { allowed: true, path: canonical };
  } catch (error) {
    return { allowed: false, reason: `path cannot be resolved: ${error instanceof Error ? error.message : String(error)}` };
  }
}
