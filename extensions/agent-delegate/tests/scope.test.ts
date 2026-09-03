import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dispatchAcrossScopes, resolveReadablePath, resolveScope } from "../src/scope.ts";

test("dispatchAcrossScopes routes relative paths to the first scope and absolute paths to their owner", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-dispatch-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const first = join(parent, "first");
  const second = join(parent, "second");
  await mkdir(join(first, "src"), { recursive: true });
  await mkdir(join(second, "docs"), { recursive: true });
  const roots = [first, second];

  assert.deepEqual(dispatchAcrossScopes(roots, "src/app.ts"), { root: first, path: "src/app.ts" });
  assert.deepEqual(dispatchAcrossScopes(roots, undefined), { root: first, path: "." });
  assert.deepEqual(dispatchAcrossScopes(roots, join(second, "docs", "guide.md")), { root: second, path: join("docs", "guide.md") });
  assert.deepEqual(dispatchAcrossScopes(roots, second), { root: second, path: "." });
  assert.throws(() => dispatchAcrossScopes(roots, join(parent, "elsewhere", "x.md")), /outside every delegated scope/);
  assert.throws(() => dispatchAcrossScopes(roots, join(second, "..", "elsewhere")), /outside every delegated scope/);
});

test("scope must exist and resolve beneath home or cwd", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "agent-delegate-scope-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, "project"));
  assert.equal(resolveScope(cwd, "project").allowed, true);
  assert.equal(resolveScope(cwd, "missing").allowed, false);
});

test("scope may cross out of cwd to any lane beneath home", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-cross-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const home = join(parent, "home");
  const cwd = join(home, "projects", "extensions", "repo");
  await mkdir(cwd, { recursive: true });
  await mkdir(join(home, "journals"), { recursive: true });
  await mkdir(join(home, ".config", "app"), { recursive: true });
  await mkdir(join(parent, "outside"));
  const opts = { homeDirectory: home };
  assert.equal(resolveScope(cwd, ".", opts).allowed, true);
  assert.equal(resolveScope(cwd, "../../../journals", opts).allowed, true);
  assert.equal(resolveScope(cwd, "~/journals", opts).allowed, true);
  assert.equal(resolveScope(cwd, join(home, "journals"), opts).allowed, true);
  assert.equal(resolveScope(cwd, join(home, ".config", "app"), opts).allowed, false);
  assert.equal(resolveScope(cwd, home, opts).allowed, false);
  assert.equal(resolveScope(cwd, "/", opts).allowed, false);
  assert.equal(resolveScope(cwd, join(parent, "outside"), opts).allowed, false);
});

test("a home cwd follows the same rule as any other cwd", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-delegate-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "work", "project"), { recursive: true });
  await mkdir(join(home, "wiki"), { recursive: true });
  await mkdir(join(home, ".local", "bin"), { recursive: true });
  assert.equal(resolveScope(home, ".", { homeDirectory: home }).allowed, false);
  assert.equal(resolveScope(home, "wiki", { homeDirectory: home }).allowed, true);
  assert.equal(resolveScope(home, "work/project", { homeDirectory: home }).allowed, true);
  assert.equal(resolveScope(home, "work", { homeDirectory: home }).allowed, true);
  assert.equal(resolveScope(home, ".local/bin", { homeDirectory: home }).allowed, false);
});

test("scope symlinks are authorized by their canonical destination", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-scope-link-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const home = join(parent, "home");
  const cwd = join(home, "projects", "repo");
  const journal = join(home, "journals");
  const hidden = join(home, ".docker");
  const outside = join(parent, "outside");
  await mkdir(cwd, { recursive: true });
  await mkdir(journal, { recursive: true });
  await mkdir(hidden);
  await mkdir(outside);
  await symlink(journal, join(cwd, "journal-link"));
  await symlink(hidden, join(cwd, "hidden-link"));
  await symlink(outside, join(cwd, "outside-link"));
  const opts = { homeDirectory: home };
  assert.equal(resolveScope(cwd, "journal-link", opts).allowed, true);
  assert.equal(resolveScope(cwd, "hidden-link", opts).allowed, false);
  assert.equal(resolveScope(cwd, "outside-link", opts).allowed, false);
});

test("research scope optional", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "agent-delegate-optional-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, "project"));
  const scopeless = resolveScope(cwd, undefined, { required: false });
  assert.deepEqual(scopeless, { allowed: true });
  const scoped = resolveScope(cwd, "project", { required: false });
  assert.equal(scoped.allowed, true);
  assert.ok(scoped.path?.endsWith("project"));
});

test("prose scope required", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "agent-delegate-required-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const omitted = resolveScope(cwd, undefined);
  assert.equal(omitted.allowed, false);
  assert.match(omitted.reason ?? "", /requires a scope directory/);
  const explicit = resolveScope(cwd, undefined, { required: true });
  assert.equal(explicit.allowed, false);
  assert.match(explicit.reason ?? "", /requires a scope directory/);
});

test("home and root still denied for research scope", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-delegate-research-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const atHome = resolveScope(home, ".", { required: false, homeDirectory: home });
  assert.equal(atHome.allowed, false);
  assert.match(atHome.reason ?? "", /narrower than the home directory|project-level scope/);
  const atRoot = resolveScope("/", ".", { required: false, homeDirectory: home });
  assert.equal(atRoot.allowed, false);
  assert.match(atRoot.reason ?? "", /narrower than the home directory or filesystem root/);
  assert.equal(resolveScope("/", tmpdir(), { required: false, homeDirectory: home }).allowed, false);
});

test("read paths remain in scope across traversal and symlinks", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-path-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "project");
  await mkdir(root);
  await writeFile(join(root, "ok.txt"), "ok");
  await writeFile(join(parent, "secret.txt"), "secret");
  await symlink(join(parent, "secret.txt"), join(root, "escape"));
  assert.equal(resolveReadablePath(root, "ok.txt").allowed, true);
  assert.equal(resolveReadablePath(root, "../secret.txt").allowed, false);
  assert.equal(resolveReadablePath(root, "escape").allowed, false);
  assert.equal(resolveReadablePath(root, "new/missing.txt").allowed, true);
});

test("common secret-bearing paths are blocked but templates remain readable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agent-delegate-secret-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".git"));
  for (const path of [".env", ".env.local", "server.pem", ".npmrc", ".git/config"]) {
    assert.equal(resolveReadablePath(root, path).allowed, false, path);
  }
  assert.equal(resolveReadablePath(root, ".env.example").allowed, true);
  assert.equal(resolveReadablePath(root, "src/auth.ts").allowed, true);
  assert.equal(resolveReadablePath(root, ".GIT/config").allowed, false);
  assert.equal(resolveReadablePath(root, "server.pem/value").allowed, false);
});

test("blocked scope ancestors remain visible even when Pi starts inside them", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "agent-delegate-ancestor-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const gitCwd = join(home, "project", ".git", "nested");
  const sshCwd = join(home, ".ssh", "project");
  const configProject = join(home, ".config", "project");
  await mkdir(gitCwd, { recursive: true });
  await mkdir(sshCwd, { recursive: true });
  await mkdir(configProject, { recursive: true });
  assert.equal(resolveScope(gitCwd, ".", { homeDirectory: home }).allowed, false);
  assert.equal(resolveScope(sshCwd, ".", { homeDirectory: home }).allowed, false);
  assert.equal(resolveScope(join(home, ".config"), "project", { homeDirectory: home }).allowed, false);
});
