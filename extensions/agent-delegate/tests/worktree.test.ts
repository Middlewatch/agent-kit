import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorktree, removeWorktree, summarizeWorktree } from "../src/worktree.ts";
import { gitCommit, writeFile as writerWriteFile } from "../src/write.ts";

async function tempRepo(t: import("node:test").TestContext): Promise<{ repo: string; worktrees: string }> {
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-worktree-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const repo = join(parent, "repo");
  const worktrees = join(parent, "worktrees");
  await mkdir(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  git("init", "-q", "-b", "main");
  await writeFile(join(repo, "README.md"), "# repo\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "root");
  return { repo, worktrees };
}

test("createWorktree branches delegate/<id> from HEAD into the worktrees dir", async (t) => {
  const { repo, worktrees } = await tempRepo(t);
  const created = await createWorktree(repo, "wt-1", worktrees);
  assert.equal(created.branch, "delegate/wt-1");
  assert.equal(created.path, join(worktrees, "wt-1"));
  assert.ok(existsSync(join(created.path, "README.md")), "the worktree carries the repo content");
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: created.path }).toString().trim();
  assert.equal(branch, "delegate/wt-1");
  assert.match(created.baseCommit, /^[0-9a-f]{40}$/);
});

test("createWorktree resolves the repo from a subdirectory scope and refuses non-repos", async (t) => {
  const { repo, worktrees } = await tempRepo(t);
  await mkdir(join(repo, "src"));
  const created = await createWorktree(join(repo, "src"), "wt-sub", worktrees);
  assert.equal(created.repoRoot, repo);
  const bare = await mkdtemp(join(tmpdir(), "agent-delegate-norepo-"));
  t.after(() => rm(bare, { recursive: true, force: true }));
  await assert.rejects(createWorktree(bare, "wt-x", worktrees), /not inside a git repository/);
});

test("summarizeWorktree reports commits, diffstat, and dirty state", async (t) => {
  const { repo, worktrees } = await tempRepo(t);
  const created = await createWorktree(repo, "wt-2", worktrees);
  let summary = await summarizeWorktree(created.path, created.baseCommit);
  assert.equal(summary.commits.length, 0);
  assert.equal(summary.dirty, false);

  await writerWriteFile(created.path, "feature.txt", "one\ntwo\n");
  await gitCommit(created.path, "add feature file");
  await writerWriteFile(created.path, "uncommitted.txt", "later\n");
  summary = await summarizeWorktree(created.path, created.baseCommit);
  assert.equal(summary.commits.length, 1);
  assert.match(summary.commits[0], /add feature file/);
  assert.match(summary.diffstat, /feature\.txt/);
  assert.equal(summary.dirty, true, "uncommitted files are reported");
});

test("removeWorktree deletes the worktree and its branch", async (t) => {
  const { repo, worktrees } = await tempRepo(t);
  const created = await createWorktree(repo, "wt-3", worktrees);
  await removeWorktree(created.repoRoot, created.path, created.branch);
  assert.equal(existsSync(created.path), false);
  const branches = execFileSync("git", ["branch", "--list", "delegate/wt-3"], { cwd: repo }).toString().trim();
  assert.equal(branches, "", "the branch is gone");
});
