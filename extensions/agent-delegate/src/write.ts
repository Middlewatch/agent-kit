/**
 * Writer-child operations: `write_file` and `edit_file` jailed to the
 * extension-created worktree, plus a fixed-argv `git_commit` with hooks,
 * signing, aliases, and external helpers disabled. No shell, no execution.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { resolveReadablePath } from "./scope.ts";
import { truncateUtf8 } from "./protocol.ts";

const execFileAsync = promisify(execFile);
const GIT_BIN = ["/usr/bin/git", "/usr/local/bin/git"].find(existsSync);
const GIT_TIMEOUT_MS = 15_000;
const MAX_WRITE_BYTES = 2 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024;

export interface WriteOutcome {
  path: string;
  bytes: number;
}

export interface EditOutcome {
  path: string;
  replaced: number;
}

export interface CommitOutcome {
  text: string;
  truncated: boolean;
}

/**
 * Authorize one writable path: same lexical jail and secret policy as reads
 * (resolveReadablePath), plus a symlink-component sweep over the existing
 * prefix so a link inside the jail cannot redirect a write outside it.
 */
async function authorizedWritablePath(writeRoot: string, requested: string): Promise<string> {
  const decision = resolveReadablePath(writeRoot, requested);
  if (!decision.allowed || !decision.path) throw new Error(decision.reason ?? "path denied");
  const rel = relative(writeRoot, decision.path);
  let cursor = writeRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`symlink paths are not writable: ${requested}`);
    } catch (error: any) {
      if (error?.code === "ENOENT") break; // the remainder does not exist yet: safe to create
      throw error;
    }
  }
  try {
    const existing = await lstat(decision.path);
    if (existing.isFile() && existing.nlink > 1) throw new Error(`multiply-linked files are not writable: ${requested}`);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  return decision.path;
}

export async function writeFile(writeRoot: string, requested: string, content: string): Promise<WriteOutcome> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_WRITE_BYTES) throw new Error(`content exceeds ${MAX_WRITE_BYTES} byte write limit`);
  const path = await authorizedWritablePath(writeRoot, requested);
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, content, "utf8");
  return { path, bytes };
}

export async function editFile(writeRoot: string, requested: string, oldText: string, newText: string): Promise<EditOutcome> {
  if (!oldText) throw new Error("oldText must be non-empty");
  const path = await authorizedWritablePath(writeRoot, requested);
  const current = await readFile(path, "utf8");
  let occurrences = 0;
  for (let index = current.indexOf(oldText); index !== -1; index = current.indexOf(oldText, index + 1)) occurrences += 1;
  if (occurrences === 0) throw new Error(`oldText not found in ${requested}`);
  if (occurrences > 1) throw new Error(`oldText matches ${occurrences} locations in ${requested}; make it unique`);
  await fsWriteFile(path, current.replace(oldText, newText), "utf8");
  return { path, replaced: 1 };
}

/** Stage everything in the worktree and commit with a fixed argv. */
export async function gitCommit(writeRoot: string, message: string): Promise<CommitOutcome> {
  if (!GIT_BIN) throw new Error("no trusted system Git executable found");
  if (!message.trim()) throw new Error("commit message must be non-empty");
  const env: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TMPDIR: process.env.TMPDIR,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
  const config = [
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "commit.gpgsign=false",
    "-c", "tag.gpgsign=false",
    "-c", "user.name=agent-delegate writer",
    "-c", "user.email=agent-delegate@localhost",
  ];
  const run = (args: string[]) =>
    execFileAsync(GIT_BIN, [...config, ...args], { cwd: writeRoot, timeout: GIT_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, env });
  await run(["add", "--all", "--", "."]);
  try {
    const outcome = await run(["commit", "--no-verify", "-m", message]);
    return truncateUtf8(outcome.stdout.trim() || "(committed)", MAX_GIT_OUTPUT_BYTES, "\n[git output truncated]");
  } catch (error: any) {
    const text = `${error?.stdout ?? ""}${error?.stderr ?? ""}`;
    if (/nothing to commit|nothing added to commit/i.test(text)) {
      return { text: "nothing to commit: the worktree matches HEAD", truncated: false };
    }
    throw new Error(`git commit failed: ${truncateUtf8(text || String(error), 1000, "…").text}`);
  }
}
