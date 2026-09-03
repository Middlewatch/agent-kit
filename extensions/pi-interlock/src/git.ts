import { spawnSync } from "node:child_process";

import type { GitCommandResult, GitCommandRunner } from "./contracts.ts";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024;
const GIT_TIMEOUT_MS = 2_000;

export const runGit: GitCommandRunner = (
  args: readonly string[],
): GitCommandResult => {
  const result = spawnSync("git", [...args], {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
  return {
    ok: result.status === 0 && result.error === undefined,
    stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
  };
};

export function gitOutput(
  cwd: string,
  args: readonly string[],
  runner: GitCommandRunner = runGit,
): string | undefined {
  try {
    const result = runner(["-C", cwd, ...args]);
    const stdout = result.stdout.trim();
    return result.ok && stdout.length > 0 ? stdout : undefined;
  } catch {
    return undefined;
  }
}

export interface GitState {
  repositoryRoot?: string;
  currentBranch?: string;
  pushDestination?: string;
  stateResolved: boolean;
}

export function readGitState(
  cwd: string,
  runner: GitCommandRunner = runGit,
): GitState {
  const repositoryRoot = gitOutput(
    cwd,
    ["rev-parse", "--show-toplevel"],
    runner,
  );
  if (repositoryRoot === undefined) return { stateResolved: false };
  const currentBranch = gitOutput(
    cwd,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    runner,
  );
  const pushDestination = gitOutput(
    cwd,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{push}"],
    runner,
  );
  return {
    repositoryRoot,
    ...(currentBranch === undefined ? {} : { currentBranch }),
    ...(pushDestination === undefined ? {} : { pushDestination }),
    stateResolved: currentBranch !== undefined,
  };
}
