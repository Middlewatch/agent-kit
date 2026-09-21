/** Run: node --test local-tools.test.ts (Node 22.18+ strips types natively). */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  isOnPath,
  parseAdvertised,
  readLocalTools,
  renderLocalTools,
} from "./local-tools.ts";

const INDEX = [
  "# System tools index",
  "",
  "Intro paragraph.",
  "",
  "## Advertised",
  "",
  "- `sess`: read session transcripts without loading JSONL",
  "- `prefixdiff`: where two request payloads diverge",
  "- not a tool bullet",
  "- `bin/relative`: names with a path are ignored",
  "",
  "## Toolchains",
  "",
  "- `zig`: outside the section, not advertised",
].join("\n");

test("parseAdvertised takes only single-line tool bullets inside ## Advertised", () => {
  assert.deepEqual(parseAdvertised(INDEX), [
    { name: "sess", line: "- `sess`: read session transcripts without loading JSONL" },
    { name: "prefixdiff", line: "- `prefixdiff`: where two request payloads diverge" },
  ]);
  assert.deepEqual(parseAdvertised("# Index\n\n## Toolchains\n- `zig`: x"), []);
});

test("renderLocalTools drops names the PATH check rejects", () => {
  const items = parseAdvertised(INDEX);
  assert.equal(
    renderLocalTools(items, (name) => name === "sess"),
    "- `sess`: read session transcripts without loading JSONL",
  );
  assert.equal(renderLocalTools(items, () => false), "");
});

test("isOnPath finds an executable file and nothing else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-tools-"));
  try {
    fs.writeFileSync(path.join(dir, "present"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "plain"), "", { mode: 0o644 });
    fs.mkdirSync(path.join(dir, "subdir"), { mode: 0o755 });
    assert.equal(isOnPath("present", dir), true);
    assert.equal(isOnPath("plain", dir), false);
    assert.equal(isOnPath("subdir", dir), false);
    assert.equal(isOnPath("absent", dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readLocalTools renders empty for a missing index", () => {
  assert.equal(readLocalTools(path.join(os.tmpdir(), "no-such-index.md")), "");
});

