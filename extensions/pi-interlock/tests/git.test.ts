import assert from "node:assert/strict";
import { test } from "node:test";

import type { GitCommandRunner } from "../src/contracts.ts";
import { gitOutput, readGitState } from "../src/git.ts";

test("read-only Git preflight uses the injected argv seam", () => {
  const calls: readonly string[][] = [];
  const mutableCalls = calls as string[][];
  const runner: GitCommandRunner = (args) => {
    mutableCalls.push([...args]);
    const command = args.slice(2).join(" ");
    if (command === "rev-parse --show-toplevel")
      return { ok: true, stdout: "/repo\n" };
    if (command === "symbolic-ref --quiet --short HEAD")
      return { ok: true, stdout: "feature\n" };
    if (command === "rev-parse --abbrev-ref --symbolic-full-name @{push}")
      return { ok: true, stdout: "origin/main\n" };
    return { ok: false, stdout: "" };
  };
  assert.deepEqual(readGitState("/repo/sub", runner), {
    repositoryRoot: "/repo",
    currentBranch: "feature",
    pushDestination: "origin/main",
    stateResolved: true,
  });
  assert.deepEqual(calls, [
    ["-C", "/repo/sub", "rev-parse", "--show-toplevel"],
    ["-C", "/repo/sub", "symbolic-ref", "--quiet", "--short", "HEAD"],
    [
      "-C",
      "/repo/sub",
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{push}",
    ],
  ]);
});

test("partial Git preflight failure remains unresolved", () => {
  const partial: GitCommandRunner = (args) =>
    args.slice(2).join(" ") === "rev-parse --show-toplevel"
      ? { ok: true, stdout: "/repo" }
      : { ok: false, stdout: "" };
  assert.deepEqual(readGitState("/repo", partial), {
    repositoryRoot: "/repo",
    stateResolved: false,
  });
});

test("Git failure is bounded and reports unresolved state", () => {
  const failing: GitCommandRunner = () => ({ ok: false, stdout: "ignored" });
  assert.equal(
    gitOutput("/outside", ["rev-parse", "HEAD"], failing),
    undefined,
  );
  assert.deepEqual(readGitState("/outside", failing), {
    stateResolved: false,
  });
});

test("Git runner exceptions do not escape preflight", () => {
  const throwing: GitCommandRunner = () => {
    throw new Error("fixture failure");
  };
  assert.deepEqual(readGitState("/outside", throwing), {
    stateResolved: false,
  });
});
