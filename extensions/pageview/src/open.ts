import path from "node:path";

/**
 * Recognize a bash command that is exactly one `xdg-open <file>` or
 * `open <file>` invocation. Compound commands, multiple arguments, shell
 * metacharacters, and web URLs stay untouched: rewriting inside a script
 * risks mangling it, and a failed xdg-open there is a signal the agent can
 * handle on its own.
 */
export function parseOpenCommand(command: string): { target: string } | undefined {
  const match = command.trim().match(/^(?:xdg-open|open)\s+(.+)$/s);
  if (!match) return undefined;
  const rest = match[1]!.trim();

  let target: string;
  const quoted = rest.match(/^"([^"]+)"$|^'([^']+)'$/);
  if (quoted) {
    target = (quoted[1] ?? quoted[2])!;
  } else {
    if (/[\s;|&<>`$()\\]/.test(rest)) return undefined;
    target = rest;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return undefined;
  return { target };
}

/** Resolve a parsed target against the cwd; undefined when it escapes. */
export function resolveInsideCwd(cwd: string, target: string): string | undefined {
  const absolute = path.resolve(cwd, target);
  const rel = path.relative(cwd, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return absolute;
}
