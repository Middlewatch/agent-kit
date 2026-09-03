import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectGitDiff, inspectGitStatus } from "../src/git-inspect.ts";

test("fixed Git inspection reports scoped status and unstaged diff", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-git-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "tracked.txt"), "before\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "base"], { cwd: dir });
  writeFileSync(join(dir, "tracked.txt"), "after\n");
  writeFileSync(join(dir, "untracked.txt"), "new\n");
  assert.match((await inspectGitStatus(dir)).text, / M tracked\.txt/);
  assert.match((await inspectGitStatus(dir)).text, /\?\? untracked\.txt/);
  const diff = await inspectGitDiff(dir);
  assert.match(diff.text, /-before/);
  assert.match(diff.text, /\+after/);
});
test("Git inspection ignores an inherited external diff command", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-git-safe-"));
  const marker = join(dir, "external-ran");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "tracked.txt"), "before\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "base"], { cwd: dir });
  writeFileSync(join(dir, "tracked.txt"), "after\n");
  const saved = process.env.GIT_EXTERNAL_DIFF;
  process.env.GIT_EXTERNAL_DIFF = `touch ${marker}`;
  try {
    await inspectGitDiff(dir);
    assert.equal(existsSync(marker), false);
  } finally {
    if (saved === undefined) delete process.env.GIT_EXTERNAL_DIFF;
    else process.env.GIT_EXTERNAL_DIFF = saved;
  }
});
test("Git inspection ignores a scope-local git shim in inherited PATH", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-git-path-"));
  const marker = join(dir, "shim-ran");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "git"), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `.:${saved}`;
  try {
    await inspectGitStatus(dir);
    assert.equal(existsSync(marker), false);
  } finally {
    process.env.PATH = saved;
  }
});
