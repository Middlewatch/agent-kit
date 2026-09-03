import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectFind, inspectGrep, inspectLs, inspectRead } from "../src/inspect.ts";

async function fixture(t: any): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "sol-inspect-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "project");
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "src", "main.ts"), "export const answer = 42;\n");
  await writeFile(join(root, "src", "other.ts"), "export const other = 7;\n");
  await writeFile(join(root, ".env"), "TOKEN=secret\n");
  await writeFile(join(root, ".git", "config"), "secret metadata\n");
  await writeFile(join(parent, "outside.txt"), "outside secret\n");
  await symlink(join(parent, "outside.txt"), join(root, "escape"));
  return root;
}

test("read returns numbered scoped text and denies secrets or symlinks", async (t) => {
  const root = await fixture(t);
  assert.match((await inspectRead(root, "src/main.ts")).text, /1: export const answer/);
  await assert.rejects(inspectRead(root, ".env"), /environment-secret/);
  await assert.rejects(inspectRead(root, "escape"), /escapes|symlink/);
});

test("recursive grep checks every descendant and omits blocked files", async (t) => {
  const root = await fixture(t);
  const result = await inspectGrep(root, "answer", ".");
  assert.match(result.text, /src\/main\.ts:1: export const answer/);
  assert.doesNotMatch(result.text, /TOKEN|secret metadata|outside secret/);
  assert.ok((result.omitted ?? 0) >= 3);
});

test("find and ls omit secret paths and symlinks", async (t) => {
  const root = await fixture(t);
  const found = await inspectFind(root, "**/*", ".");
  assert.match(found.text, /src\/main\.ts/);
  assert.doesNotMatch(found.text, /\.env|\.git\/config|escape/);
  const listed = await inspectLs(root, ".");
  assert.match(listed.text, /src\//);
  assert.doesNotMatch(listed.text, /^\.env$/m);
  assert.doesNotMatch(listed.text, /^\.git\/$/m);
  assert.doesNotMatch(listed.text, /^escape$/m);
});

test("secret-named ancestors, casing variants, and hard links are denied", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "server.pem"));
  await writeFile(join(root, "server.pem", "value"), "hidden\n");
  await mkdir(join(root, ".GIT"));
  await writeFile(join(root, ".GIT", "CONFIG"), "hidden\n");
  await link(join(root, "src", "main.ts"), join(root, "src", "hardlink.ts"));
  await assert.rejects(inspectRead(root, "server.pem/value"), /secret-bearing suffix/);
  await assert.rejects(inspectRead(root, ".GIT/CONFIG"), /blocked/);
  await assert.rejects(inspectRead(root, "src/hardlink.ts"), /multiply-linked/);
  const found = await inspectFind(root, "*.ts", "src");
  assert.doesNotMatch(found.text, /main\.ts|hardlink\.ts/);
  const listed = await inspectLs(root, "src");
  assert.doesNotMatch(listed.text, /main\.ts|hardlink\.ts/);
});

test("find patterns are relative to the requested start and limits are explicit", async (t) => {
  const root = await fixture(t);
  const relativeFind = await inspectFind(root, "*.ts", "src");
  assert.match(relativeFind.text, /src\/main\.ts/);
  const limitedFind = await inspectFind(root, "*.ts", "src", 1);
  assert.match(limitedFind.text, /match limit reached/);
  const limitedGrep = await inspectGrep(root, "export", "src", undefined, true, 1);
  assert.match(limitedGrep.text, /match limit reached; results incomplete/);
});
