import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { resolveReadablePath } from "./scope.ts";
import { truncateUtf8 } from "./protocol.ts";

const MAX_OUTPUT_BYTES = 48 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_VISITED_ENTRIES = 10_000;
const MAX_READ_LINES = 2000;

export interface InspectResult {
  text: string;
  truncated: boolean;
  visited?: number;
  omitted?: number;
}

function truncate(value: string, maxBytes = MAX_OUTPUT_BYTES): InspectResult {
  return truncateUtf8(value, maxBytes, "\n[inspection output truncated]");
}

async function rejectSymlinkComponents(scopeRoot: string, requested: string): Promise<void> {
  const lexical = resolve(scopeRoot, requested.replace(/^@/, ""));
  const rel = relative(scopeRoot, lexical);
  let cursor = scopeRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`symlink paths are not inspectable: ${requested}`);
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function authorizedPath(scopeRoot: string, requested: string): Promise<string> {
  const decision = resolveReadablePath(scopeRoot, requested);
  if (!decision.allowed || !decision.path) throw new Error(decision.reason ?? "path denied");
  await rejectSymlinkComponents(scopeRoot, requested);
  return decision.path;
}

async function readRegularFile(scopeRoot: string, requested: string): Promise<string> {
  const path = await authorizedPath(scopeRoot, requested);
  const stat = await lstat(path);
  if (!stat.isFile()) throw new Error(`not a regular file: ${requested}`);
  if (stat.nlink > 1) throw new Error(`multiply-linked files are not inspectable: ${requested}`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} byte inspection limit: ${requested}`);
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(path, flags);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error(`not a regular file: ${requested}`);
    if (opened.nlink > 1) throw new Error(`multiply-linked files are not inspectable: ${requested}`);
    if (opened.size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} byte inspection limit: ${requested}`);
    const data = await handle.readFile();
    if (data.includes(0)) throw new Error(`binary files are not inspectable: ${requested}`);
    return data.toString("utf8");
  } finally {
    await handle.close();
  }
}

interface WalkFile {
  absolute: string;
  relative: string;
  matchPath: string;
}

async function walkFiles(scopeRoot: string, requested = "."): Promise<{ files: WalkFile[]; visited: number; omitted: number; capped: boolean }> {
  const start = await authorizedPath(scopeRoot, requested);
  const startStat = await lstat(start);
  if (startStat.isFile()) {
    if (startStat.nlink > 1) throw new Error(`multiply-linked files are not inspectable: ${requested}`);
    const rel = relative(scopeRoot, start);
    return { files: [{ absolute: start, relative: rel, matchPath: basename(rel) }], visited: 1, omitted: 0, capped: false };
  }
  if (!startStat.isDirectory()) throw new Error(`not a file or directory: ${requested}`);

  const files: WalkFile[] = [];
  const stack = [start];
  let visited = 0;
  let omitted = 0;
  let capped = false;
  while (stack.length > 0 && visited < MAX_VISITED_ENTRIES) {
    const directory = stack.pop()!;
    const handle = await opendir(directory);
    for await (const entry of handle) {
      visited += 1;
      if (visited > MAX_VISITED_ENTRIES) {
        capped = true;
        omitted += 1;
        break;
      }
      const absolute = resolve(directory, entry.name);
      const rel = relative(scopeRoot, absolute);
      const decision = resolveReadablePath(scopeRoot, rel);
      let stat;
      try { stat = await lstat(absolute); } catch { omitted += 1; continue; }
      if (!decision.allowed || stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
        omitted += 1;
        continue;
      }
      if (stat.isDirectory()) stack.push(absolute);
      else if (stat.isFile()) files.push({ absolute, relative: rel, matchPath: relative(start, absolute) });
      else omitted += 1;
    }
    if (capped) break;
  }
  if (stack.length > 0) {
    capped = true;
    omitted += stack.length;
  }
  return { files, visited: Math.min(visited, MAX_VISITED_ENTRIES), omitted, capped };
}

function globRegex(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export async function inspectRead(scopeRoot: string, path: string, offset = 1, limit = 500): Promise<InspectResult> {
  const text = await readRegularFile(scopeRoot, path);
  const lines = text.split("\n");
  const start = Math.max(0, offset - 1);
  const count = Math.min(Math.max(1, limit), MAX_READ_LINES);
  const selected = lines.slice(start, start + count).map((line, index) => `${start + index + 1}: ${line}`).join("\n");
  const later = start + count < lines.length ? `\n[${lines.length - (start + count)} later line(s) omitted]` : "";
  return truncate(selected + later);
}

export async function inspectLs(scopeRoot: string, path = ".", limit = 500): Promise<InspectResult> {
  const directory = await authorizedPath(scopeRoot, path);
  if (!(await lstat(directory)).isDirectory()) throw new Error(`not a directory: ${path}`);
  const rows: string[] = [];
  let omitted = 0;
  let visited = 0;
  let capped = false;
  const handle = await opendir(directory);
  for await (const entry of handle) {
    visited += 1;
    if (visited > MAX_VISITED_ENTRIES) {
      capped = true;
      omitted += 1;
      break;
    }
    const rel = relative(scopeRoot, resolve(directory, entry.name));
    const decision = resolveReadablePath(scopeRoot, rel);
    let stat;
    try { stat = await lstat(resolve(directory, entry.name)); } catch { omitted += 1; continue; }
    if (!decision.allowed || stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
      omitted += 1;
      continue;
    }
    if (rows.length >= Math.min(limit, 1000)) {
      omitted += 1;
      continue;
    }
    rows.push(`${entry.name}${stat.isDirectory() ? "/" : ""}`);
  }
  rows.sort();
  if (omitted) rows.push(`[${omitted} blocked or excess entr${omitted === 1 ? "y" : "ies"} omitted]`);
  if (capped) rows.push(`[directory traversal capped after ${MAX_VISITED_ENTRIES} entries; results incomplete]`);
  return { ...truncate(rows.join("\n")), visited: Math.min(visited, MAX_VISITED_ENTRIES), omitted };
}

export async function inspectFind(scopeRoot: string, pattern: string, path = ".", limit = 1000): Promise<InspectResult> {
  const walked = await walkFiles(scopeRoot, path);
  const matcher = globRegex(pattern);
  const allMatches = walked.files
    .filter((file) => {
      const matchPath = file.matchPath.split(sep).join("/");
      return matcher.test(matchPath) || (!pattern.includes("/") && matcher.test(basename(matchPath)));
    })
    .map((file) => file.relative.split(sep).join("/"))
    .sort();
  const effectiveLimit = Math.min(limit, 2000);
  const matches = allMatches.slice(0, effectiveLimit);
  if (allMatches.length > effectiveLimit) matches.push(`[match limit reached; ${allMatches.length - effectiveLimit} additional match(es) omitted]`);
  if (walked.omitted) matches.push(`[${walked.omitted} blocked or excess entries omitted]`);
  if (walked.capped) matches.push(`[traversal capped after ${MAX_VISITED_ENTRIES} entries; results incomplete]`);
  return { ...truncate(matches.join("\n")), visited: walked.visited, omitted: walked.omitted };
}

export async function inspectGrep(
  scopeRoot: string,
  query: string,
  path = ".",
  glob?: string,
  caseSensitive = true,
  limit = 200,
): Promise<InspectResult> {
  const needle = caseSensitive ? query : query.toLowerCase();
  const fileMatcher = glob ? globRegex(glob) : undefined;
  const walked = await walkFiles(scopeRoot, path);
  const rows: string[] = [];
  let omitted = walked.omitted;
  let matchLimitReached = false;
  for (const file of walked.files) {
    const normalized = file.relative.split(sep).join("/");
    if (fileMatcher && !fileMatcher.test(normalized) && !fileMatcher.test(basename(normalized))) continue;
    try {
      const text = await readRegularFile(scopeRoot, file.relative);
      for (const [index, line] of text.split("\n").entries()) {
        const haystack = caseSensitive ? line : line.toLowerCase();
        if (!haystack.includes(needle)) continue;
        const preview = line.length > 2000 ? `${line.slice(0, 2000)}…` : line;
        rows.push(`${normalized}:${index + 1}: ${preview}`);
        if (rows.length >= Math.min(limit, 1000)) {
          matchLimitReached = true;
          break;
        }
      }
    } catch {
      omitted += 1;
    }
    if (rows.length >= Math.min(limit, 1000)) break;
  }
  if (matchLimitReached) rows.push("[match limit reached; results incomplete]");
  if (omitted) rows.push(`[${omitted} blocked, binary, large, or excess files/entries omitted]`);
  if (walked.capped) rows.push(`[traversal capped after ${MAX_VISITED_ENTRIES} entries; results incomplete]`);
  return { ...truncate(rows.join("\n")), visited: walked.visited, omitted };
}
