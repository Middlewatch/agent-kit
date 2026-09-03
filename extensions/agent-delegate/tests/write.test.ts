import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { editFile, gitCommit, writeFile as writerWriteFile } from "../src/write.ts";

async function tempRoot(t: import("node:test").TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-delegate-write-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function initRepo(root: string): void {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "root");
}

test("write_file creates files and parent directories inside the jail", async (t) => {
  const root = await tempRoot(t);
  const outcome = await writerWriteFile(root, "src/new/module.ts", "export const x = 1;\n");
  assert.equal(outcome.bytes, 20);
  assert.equal(await readFile(join(root, "src", "new", "module.ts"), "utf8"), "export const x = 1;\n");
});

test("write_file refuses jail escapes and secret-bearing names", async (t) => {
  const root = await tempRoot(t);
  await assert.rejects(writerWriteFile(root, "../outside.txt", "x"), /escapes the delegated scope/);
  await assert.rejects(writerWriteFile(root, "/etc/passwd", "x"), /escapes the delegated scope/);
  await assert.rejects(writerWriteFile(root, ".env", "SECRET=1"), /environment-secret name/);
  await assert.rejects(writerWriteFile(root, "deploy.pem", "x"), /secret-bearing suffix/);
});

test("write_file refuses symlinked paths", async (t) => {
  const parent = await tempRoot(t);
  const root = join(parent, "jail");
  const outside = join(parent, "outside");
  await mkdir(root);
  await mkdir(outside);
  await symlink(outside, join(root, "link"));
  await assert.rejects(writerWriteFile(root, "link/escape.txt", "x"), /symlink|escapes/);
});

test("write_file refuses multiply-linked files", async (t) => {
  const parent = await tempRoot(t);
  const root = join(parent, "jail");
  await mkdir(root);
  await writeFile(join(parent, "outside.txt"), "protected\n");
  const { link } = await import("node:fs/promises");
  await link(join(parent, "outside.txt"), join(root, "linked.txt"));
  await assert.rejects(writerWriteFile(root, "linked.txt", "overwrite"), /multiply-linked/);
});

test("edit_file replaces exactly one unique occurrence", async (t) => {
  const root = await tempRoot(t);
  await writeFile(join(root, "app.ts"), "const a = 1;\nconst b = 2;\nconst c = 1;\n");
  const outcome = await editFile(root, "app.ts", "const b = 2;", "const b = 20;");
  assert.equal(outcome.replaced, 1);
  assert.equal(await readFile(join(root, "app.ts"), "utf8"), "const a = 1;\nconst b = 20;\nconst c = 1;\n");
  await assert.rejects(editFile(root, "app.ts", "const z = 9;", "x"), /oldText not found/);
  await assert.rejects(editFile(root, "app.ts", "= 1;", "x"), /oldText matches 2 locations/);
  await assert.rejects(editFile(root, "missing.ts", "a", "b"), /ENOENT|not found/i);
});

test("git_commit stages everything and commits with hooks and signing disabled", async (t) => {
  const root = await tempRoot(t);
  initRepo(root);
  // A hook that would fail the commit if hooks ran.
  await mkdir(join(root, ".git", "hooks"), { recursive: true });
  await writeFile(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await writerWriteFile(root, "feature.txt", "content\n");
  const outcome = await gitCommit(root, "add feature file");
  assert.match(outcome.text, /add feature file/);
  const log = execFileSync("git", ["log", "--format=%s", "-1"], { cwd: root }).toString().trim();
  assert.equal(log, "add feature file");
});

test("git_commit with nothing to commit reports cleanly", async (t) => {
  const root = await tempRoot(t);
  initRepo(root);
  const outcome = await gitCommit(root, "empty");
  assert.match(outcome.text, /nothing to commit/i);
});

test("git_commit does not run a repository-configured core.fsmonitor program", async (t) => {
  const root = await tempRoot(t);
  initRepo(root);
  const sentinel = join(root, "FSMON_RAN");
  const monitor = join(root, "mon.sh");
  // A program-valued core.fsmonitor git would execute during an index
  // refresh; the touch proves it ran, the exit 1 proves it is hostile.
  await writeFile(monitor, `#!/bin/sh\ntouch "${sentinel}"\nexit 1\n`, { mode: 0o755 });
  execFileSync("git", ["config", "core.fsmonitor", monitor], { cwd: root });
  await writerWriteFile(root, "f.txt", "change\n");

  // Control: with fsmonitor left enabled, this git build must invoke the
  // program (otherwise the test cannot detect a regression) — skip if not.
  execFileSync("git", ["status", "--short"], { cwd: root });
  if (!existsSync(sentinel)) {
    t.skip("this git build does not execute a program-valued core.fsmonitor");
    return;
  }
  await rm(sentinel, { force: true });

  await gitCommit(root, "commit with hostile fsmonitor configured");
  assert.equal(existsSync(sentinel), false, "git_commit must disable core.fsmonitor so the program never runs");
  const log = execFileSync("git", ["log", "--format=%s", "-1"], { cwd: root }).toString().trim();
  assert.equal(log, "commit with hostile fsmonitor configured");
});
