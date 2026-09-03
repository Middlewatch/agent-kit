import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { truncateUtf8 } from "./protocol.ts";

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 48 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const GIT_BIN = ["/usr/bin/git", "/usr/local/bin/git"].find(existsSync);

export interface GitInspectResult {
  text: string;
  truncated: boolean;
}

const SAFE_CONFIG = [
  "--no-pager",
  "-c", "core.pager=cat",
  "-c", "pager.diff=false",
  "-c", "diff.external=",
  "-c", "core.fsmonitor=false",
  "-c", "core.attributesFile=/dev/null",
];

async function runGit(scopeRoot: string, args: string[], signal?: AbortSignal): Promise<GitInspectResult> {
  if (!GIT_BIN) throw new Error("no trusted system Git executable found");
  const env: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TMPDIR: process.env.TMPDIR,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_PAGER: "cat",
    GIT_EXTERNAL_DIFF: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
  const outcome = await execFileAsync(GIT_BIN, [...SAFE_CONFIG, ...args], {
    cwd: scopeRoot,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    signal,
    env,
  });
  return truncateUtf8(outcome.stdout || "(no changes)", MAX_GIT_OUTPUT_BYTES, "\n[git inspection output truncated]");
}

/** Fixed argv only: no shell, aliases, hooks, pagers, textconv, or external diff drivers. */
export function inspectGitStatus(scopeRoot: string, signal?: AbortSignal): Promise<GitInspectResult> {
  return runGit(scopeRoot, ["status", "--short", "--untracked-files=normal", "--ignore-submodules=all", "--", "."], signal);
}

/** Read either the unstaged worktree diff or the staged index diff. */
export function inspectGitDiff(scopeRoot: string, staged = false, signal?: AbortSignal): Promise<GitInspectResult> {
  return runGit(scopeRoot, [
    "diff",
    ...(staged ? ["--cached"] : []),
    "--no-ext-diff",
    "--no-textconv",
    "--ignore-submodules=all",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--",
    ".",
  ], signal);
}
