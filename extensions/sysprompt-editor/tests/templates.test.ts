/**
 * Unit tests for the template store (lib/templates.ts): pointer resolution
 * and its fallback chain, listing order, and the splice's fail-open when no
 * template resolves. Temp directories stand in for guidance/sysprompt/.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import systemPromptExtension from "../index.ts";
import {
  listTemplates,
  readActiveTemplate,
  scaffoldTemplate,
  setActiveTemplate,
} from "../lib/templates.ts";

const STOCK_CORE =
  "You are an expert coding assistant operating inside pi, a coding agent harness. Intro.\n\n" +
  "Available tools:\n- read: Read\n\n" +
  "In addition to the tools above, more.\n\n" +
  "Guidelines:\n- Be concise\n\n" +
  "Pi documentation (read only when asked):\n- Main: /tmp/README.md";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-templates-"));
}

function seed(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf8");
  }
}

function capturedHandler(
  templatesDir: string,
): (event: unknown) => Promise<{ systemPrompt: string } | undefined> {
  let handler: unknown;
  const stub = {
    on(name: string, fn: unknown) {
      if (name === "before_agent_start") handler = fn;
    },
    registerCommand() {},
  };
  systemPromptExtension(stub as never, { templatesDir });
  assert.ok(handler, "extension registered a before_agent_start handler");
  return handler as (
    event: unknown,
  ) => Promise<{ systemPrompt: string } | undefined>;
}

test("pointer resolution: missing pointer falls back to default.md", () => {
  const dir = tempDir();
  seed(dir, { "default.md": "DEFAULT", "other.md": "OTHER" });
  assert.deepEqual(readActiveTemplate(dir), {
    name: "default.md",
    content: "DEFAULT",
  });
});

test("pointer resolution: invalid pointer line falls back to default.md", () => {
  const dir = tempDir();
  seed(dir, { "default.md": "DEFAULT", "other.md": "OTHER" });
  for (const bad of [
    "../other.md\n",
    "other.md\nsecond line\n",
    "Other.md\n",
    "other.txt\n",
    "\n",
    "sub/other.md\n",
  ]) {
    fs.writeFileSync(path.join(dir, ".active"), bad, "utf8");
    assert.equal(readActiveTemplate(dir)?.name, "default.md", `pointer ${bad}`);
  }
});

test("pointer resolution: pointer naming a missing file falls back to default.md", () => {
  const dir = tempDir();
  seed(dir, { "default.md": "DEFAULT" });
  setActiveTemplate(dir, "gone.md");
  assert.deepEqual(readActiveTemplate(dir), {
    name: "default.md",
    content: "DEFAULT",
  });
});

test("pointer resolution: default.md missing returns null", async () => {
  const dir = tempDir();
  assert.equal(readActiveTemplate(dir), null);
  // A pointer to a missing file with no default.md is also null.
  setActiveTemplate(dir, "gone.md");
  assert.equal(readActiveTemplate(dir), null);
  // The splice built on that dir leaves the stock prompt standing.
  const result = await capturedHandler(dir)({ systemPrompt: STOCK_CORE });
  assert.equal(result, undefined);
});

test("pointer resolution: switch changes rendered template", async () => {
  const dir = tempDir();
  seed(dir, {
    "default.md": "DEFAULT VOICE\n{{AVAILABLE_TOOLS}}",
    "terse.md": "TERSE VOICE\n{{AVAILABLE_TOOLS}}",
  });
  const handler = capturedHandler(dir);
  const before = await handler({ systemPrompt: STOCK_CORE });
  assert.equal(before?.systemPrompt, "DEFAULT VOICE\n- read: Read");
  setActiveTemplate(dir, "terse.md");
  const after = await handler({ systemPrompt: STOCK_CORE });
  assert.equal(after?.systemPrompt, "TERSE VOICE\n- read: Read");
});

test("list: active template sorts first", () => {
  const dir = tempDir();
  seed(dir, {
    "default.md": "D",
    "alpha.md": "A",
    "zeta.md": "Z",
    "notes.txt": "ignored",
    "Bad Name.md": "not pointer-valid, never listed",
  });
  fs.mkdirSync(path.join(dir, "subdir.md"));
  assert.deepEqual(listTemplates(dir), ["default.md", "alpha.md", "zeta.md"]);
  setActiveTemplate(dir, "zeta.md");
  assert.deepEqual(listTemplates(dir), ["zeta.md", "alpha.md", "default.md"]);
  // A pointer to a missing file leaves the plain order with default first.
  setActiveTemplate(dir, "gone.md");
  assert.deepEqual(listTemplates(dir), ["default.md", "alpha.md", "zeta.md"]);
  assert.deepEqual(listTemplates(path.join(dir, "missing")), []);
});

test("scaffold: new template is a byte copy of the active template", () => {
  const dir = tempDir();
  const bytes = "ACTIVE\r\n\u00e9 {{AVAILABLE_TOOLS}}\n\n\n";
  seed(dir, { "default.md": "DEFAULT", "voice.md": bytes });
  setActiveTemplate(dir, "voice.md");
  const active = readActiveTemplate(dir);
  assert.ok(active);
  const created = scaffoldTemplate(dir, "copy-1", active.content);
  assert.equal(created, path.join(dir, "copy-1.md"));
  assert.deepEqual(
    fs.readFileSync(created as string),
    fs.readFileSync(path.join(dir, "voice.md")),
  );
  assert.deepEqual(listTemplates(dir), ["voice.md", "copy-1.md", "default.md"]);
});

test("scaffold: invalid name rejected", () => {
  const dir = tempDir();
  for (const bad of [
    "",
    "Caps",
    "has space",
    "dot.md",
    "../up",
    "a_b",
    "x/y",
  ]) {
    const result = scaffoldTemplate(dir, bad, "content");
    assert.ok(result instanceof Error, `name ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("scaffold: existing file not overwritten", () => {
  const dir = tempDir();
  seed(dir, { "default.md": "ORIGINAL" });
  const result = scaffoldTemplate(dir, "default", "REPLACEMENT");
  assert.ok(result instanceof Error);
  assert.match(result.message, /already exists/);
  assert.equal(
    fs.readFileSync(path.join(dir, "default.md"), "utf8"),
    "ORIGINAL",
  );
});
