import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  canonicalizePath,
  PathResolutionError,
  pathIsWithin,
  pathPatternMayReach,
} from "../src/paths.ts";

test("canonicalization resolves existing and missing-leaf symlink aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-paths-"));
  try {
    const work = join(root, "work");
    const target = join(root, "target");
    mkdirSync(work);
    mkdirSync(target);
    symlinkSync(target, join(work, "alias"));

    assert.equal(canonicalizePath(join(work, "alias"), work, root), target);
    assert.equal(
      canonicalizePath(join(work, "alias", "missing", "leaf"), work, root),
      join(target, "missing", "leaf"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonicalization resolves relative and absolute dangling symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-dangling-"));
  try {
    const work = join(root, "work");
    const targets = join(root, "targets");
    mkdirSync(work);
    mkdirSync(targets);
    symlinkSync("../targets/relative.txt", join(work, "relative-link"));
    symlinkSync(join(targets, "absolute.txt"), join(work, "absolute-link"));

    assert.equal(
      canonicalizePath(join(work, "relative-link"), work, root),
      join(targets, "relative.txt"),
    );
    assert.equal(
      canonicalizePath(join(work, "absolute-link"), work, root),
      join(targets, "absolute.txt"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonicalization expands supported home forms and relative paths", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-home-"));
  try {
    const home = join(root, "home");
    const cwd = join(root, "work");
    mkdirSync(home);
    mkdirSync(cwd);
    assert.equal(canonicalizePath("~/note", cwd, home), join(home, "note"));
    assert.equal(canonicalizePath("$HOME/note", cwd, home), join(home, "note"));
    assert.equal(
      canonicalizePath("relative/note", cwd, home),
      join(cwd, "relative", "note"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("credential glob matching is segment-aware and preserves broad ancestors", () => {
  assert.equal(
    pathPatternMayReach("/users/owner/.ss?/id", "/users/owner/.ssh", "tree"),
    true,
  );
  assert.equal(
    pathPatternMayReach("/users/owner/.ssh/*", "/users/owner/.ssh", "tree"),
    true,
  );
  assert.equal(
    pathPatternMayReach("/users/owner/.netr?", "/users/owner/.netrc", "exact"),
    true,
  );
  assert.equal(
    pathPatternMayReach(
      "/users/owner/projects/*.ts",
      "/users/owner/.ssh",
      "tree",
    ),
    false,
  );
  assert.equal(
    pathPatternMayReach("/users/owner/*/*", "/users/owner/.ssh", "tree"),
    false,
  );
  assert.equal(
    pathPatternMayReach("/users/owner/[a]ssh/id", "/users/owner/.ssh", "tree"),
    false,
  );
  assert.equal(
    pathPatternMayReach("/users/owner/.ss[a-z]/id", "/users/owner/.ssh", "tree"),
    true,
  );
  assert.equal(
    pathPatternMayReach(
      "/users/owner/.[[:alpha:]][[:alpha:]][[:alpha:]]/id",
      "/users/owner/.ssh",
      "tree",
    ),
    true,
  );
  assert.equal(
    pathPatternMayReach("/users/*", "/users/owner/.ssh", "tree"),
    false,
  );
});

test("component-aware containment includes the root but not prefix siblings", () => {
  assert(pathIsWithin("/tmp/root", "/tmp/root"));
  assert(pathIsWithin("/tmp/root/child", "/tmp/root"));
  assert(!pathIsWithin("/tmp/root-other", "/tmp/root"));
  assert(pathIsWithin("/tmp/anything", "/"));
});

test("canonicalization reports symlink loops with a value-free typed error", () => {
  const root = mkdtempSync(join(tmpdir(), "interlock-loop-"));
  try {
    const loop = join(root, "loop");
    symlinkSync(loop, loop);
    assert.throws(
      () => canonicalizePath(loop, root, root),
      (error: unknown) =>
        error instanceof PathResolutionError &&
        error.message === "Path resolution failed",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
