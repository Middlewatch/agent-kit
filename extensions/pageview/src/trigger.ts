import path from "node:path";

/** Extensions whose writes get a URL announced automatically. */
const ANNOUNCE_EXTENSIONS = new Set([".html", ".htm", ".svg", ".pdf"]);

export interface WriteEvent {
  toolName: string;
  path: string | undefined;
  isError: boolean;
  cwd: string;
}

/**
 * Decide whether a finished tool call should announce a served URL. Pure:
 * the caller owns the announced-set and adds to it after a successful serve.
 * After a failed server start the caller disables the auto path for the
 * session to avoid a warning per write; /serve retries manually.
 */
export function shouldAnnounce(
  event: WriteEvent,
  announced: ReadonlySet<string>,
): { absolute: string } | undefined {
  if (event.toolName !== "write" || event.isError || !event.path) return undefined;
  if (!ANNOUNCE_EXTENSIONS.has(path.extname(event.path).toLowerCase())) return undefined;
  const absolute = path.resolve(event.cwd, event.path);
  const rel = path.relative(event.cwd, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  if (announced.has(absolute)) return undefined;
  return { absolute };
}
