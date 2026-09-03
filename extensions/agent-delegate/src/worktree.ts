/**
 * Parent-side writer worktree lifecycle: the extension creates a git
 * worktree on branch `delegate/<id>` for each writer child, summarizes the
 * branch (commit list, diffstat, dirty state) after the child exits, and
 * removes worktrees that produced nothing. All git runs use fixed argv with
 * hooks, prompts, and external helpers disabled. Merging and removing a
 * worktree that carries commits is the root's reviewed decision, not ours.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { truncateUtf8 } from "./protocol.ts";

const execFileAsync = promisify(execFile);
const GIT_BIN = ["/usr/bin/git", "/usr/local/bin/git"].find(existsSync);
const GIT_TIMEOUT_MS = 30_000;
const MAX_SUMMARY_BYTES = 8 * 1024;

export interface CreatedWorktree {
  repoRoot: string;
  branch: string;
  path: string;
  baseCommit: string;
}

export interface WorktreeSummary {
  commits: string[];
  diffstat: string;
  dirty: boolean;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  if (!GIT_BIN) throw new Error("no trusted system Git executable found");
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
  const config = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];
  const outcome = await execFileAsync(GIT_BIN, [...config, ...args], {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  return outcome.stdout;
}

export async function createWorktree(scopePath: string, id: string, worktreesDir: string): Promise<CreatedWorktree> {
  let repoRoot: string;
  try {
    repoRoot = (await runGit(scopePath, ["rev-parse", "--show-toplevel"])).trim();
  } catch (error) {
    throw new Error(`writer scope is not inside a git repository: ${scopePath}`);
  }
  const baseCommit = (await runGit(repoRoot, ["rev-parse", "HEAD"])).trim();
  const branch = `delegate/${id}`;
  const path = join(worktreesDir, id);
  await mkdir(worktreesDir, { recursive: true });
  await runGit(repoRoot, ["worktree", "add", path, "-b", branch, "HEAD"]);
  return { repoRoot, branch, path, baseCommit };
}

export async function summarizeWorktree(worktreePath: string, baseCommit: string): Promise<WorktreeSummary> {
  const log = await runGit(worktreePath, ["log", "--format=%h %s", `${baseCommit}..HEAD`]);
  const commits = log.split("\n").map((line) => line.trim()).filter(Boolean);
  const status = await runGit(worktreePath, ["status", "--short", "--untracked-files=normal", "--ignore-submodules=all"]);
  const dirty = status.trim().length > 0;
  // Committed changes get the base..HEAD stat; a dirty tree with no commits
  // gets the working-tree stat against base (tracked modifications only —
  // untracked files show through the dirty flag).
  const statArgs = commits.length ? ["diff", "--stat", "--no-ext-diff", baseCommit, "HEAD"] : dirty ? ["diff", "--stat", "--no-ext-diff", baseCommit] : undefined;
  const diffstat = statArgs
    ? truncateUtf8((await runGit(worktreePath, statArgs)).trim(), MAX_SUMMARY_BYTES, "\n[diffstat truncated]").text
    : "";
  return { commits, diffstat, dirty };
}

export async function removeWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void> {
  await runGit(repoRoot, ["worktree", "remove", "--force", worktreePath]);
  await runGit(repoRoot, ["branch", "-D", branch]);
}
