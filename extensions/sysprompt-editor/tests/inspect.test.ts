/**
 * Unit tests for lib/inspect.ts: golden byte-compares of the immediate dump,
 * the model label fallback, stamp and collision helpers, and the one-shot
 * armed capture state. No Pi process and no provider request.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  armCapture,
  awaitWireRecord,
  extractSystemPromptFromPayload,
  findWireRecord,
  freeBase,
  listDir,
  makeStamp,
  modelLabel,
  renderImmediateDump,
  renderProviderDump,
  renderWireDump,
  takeArmedCapture,
} from "../lib/inspect.ts";

const GOLDEN = new URL("../fixtures/golden/", import.meta.url);

function golden(name: string): { input: unknown; expected: string } {
  const input = JSON.parse(
    fs.readFileSync(new URL(`${name}.input.json`, GOLDEN), "utf8"),
  );
  const expected = fs.readFileSync(new URL(`${name}.md`, GOLDEN), "utf8");
  return { input, expected };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-inspect-"));
}

test("immediate dump: golden byte-compare", () => {
  const { input, expected } = golden("immediate-dump");
  assert.equal(renderImmediateDump(input as never), expected);
});

test("model label: undefined model yields unknown provider and model id", () => {
  assert.deepEqual(modelLabel(undefined), {
    provider: "unknown",
    modelId: "unknown",
  });
  assert.deepEqual(modelLabel({ provider: "anthropic", id: "claude-x" }), {
    provider: "anthropic",
    modelId: "claude-x",
  });
});

test("stamp: makeStamp zero-pads local time and freeBase suffixes on any collision", () => {
  // Month, day, hour, minute, second all single-digit to exercise padding.
  assert.equal(makeStamp(new Date(2026, 0, 5, 3, 7, 9)), "2026-01-05-030709");
  assert.equal(
    makeStamp(new Date(2026, 11, 31, 23, 59, 59)),
    "2026-12-31-235959",
  );
  const dir = tempDir();
  assert.equal(freeBase(dir, "x", [".md", ".txt"]), "x");
  fs.writeFileSync(path.join(dir, "x.txt"), "");
  assert.equal(freeBase(dir, "x", [".md", ".txt"]), "x-2");
  fs.writeFileSync(path.join(dir, "x-2.md"), "");
  assert.equal(freeBase(dir, "x", [".md", ".txt"]), "x-3");
  // A single-extension query ignores the other family's files.
  assert.equal(freeBase(dir, "x", [".md"]), "x");
});

test("immediate dump: empty options golden byte-compare", () => {
  const { input, expected } = golden("immediate-dump-empty");
  assert.deepEqual(Object.keys(input as object), ["cwd"]);
  assert.equal(renderImmediateDump(input as never), expected);
});

test("arm: capture is one-shot", () => {
  assert.equal(takeArmedCapture(), null);
  armCapture("2026-01-01-000000");
  assert.equal(takeArmedCapture(), "2026-01-01-000000");
  assert.equal(takeArmedCapture(), null);
  // Re-arming replaces the pending stamp rather than queueing.
  armCapture("a");
  armCapture("b");
  assert.equal(takeArmedCapture(), "b");
  assert.equal(takeArmedCapture(), null);
});

const HEADER = {
  timestamp: "2026-01-01-000000",
  provider: "p",
  modelId: "m",
};

test("extract: anthropic string system", () => {
  const payload = { model: "x", system: "SYS\nline two", messages: [] };
  assert.equal(extractSystemPromptFromPayload(payload), "SYS\nline two");
  const dump = renderProviderDump(HEADER, payload);
  assert.equal(dump.txt, "SYS\nline two");
  assert.match(dump.md, /^# Provider system prompt \(ground truth\)\n/);
});

test("extract: OpenAI Responses/Codex instructions", () => {
  const payload = {
    model: "gpt-x",
    instructions: "INSTRUCTIONS\nline two",
    input: [{ role: "user", content: [] }],
  };
  assert.equal(
    extractSystemPromptFromPayload(payload),
    "INSTRUCTIONS\nline two",
  );
  const dump = renderProviderDump(HEADER, payload);
  assert.equal(dump.txt, "INSTRUCTIONS\nline two");
  assert.match(dump.md, /INSTRUCTIONS\nline two/);
});

test("extract: anthropic block-array system", () => {
  const payload = {
    system: [
      { type: "text", text: "Block one" },
      { type: "text", text: "Block two", cache_control: { type: "ephemeral" } },
    ],
  };
  assert.equal(
    extractSystemPromptFromPayload(payload),
    "Block one\n\nBlock two",
  );
  // An empty block array is unrecognized rather than an empty prompt.
  assert.equal(extractSystemPromptFromPayload({ system: [] }), null);
});

test("extract: openai system message", () => {
  const payload = {
    messages: [
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
    ],
  };
  assert.equal(extractSystemPromptFromPayload(payload), "SYS");
  const blocks = {
    messages: [
      {
        role: "system",
        content: [
          { type: "text", text: "A" },
          { type: "text", text: "B" },
        ],
      },
    ],
  };
  assert.equal(extractSystemPromptFromPayload(blocks), "A\n\nB");
});

test("extract: openai developer message", () => {
  const payload = { messages: [{ role: "developer", content: "DEV" }] };
  assert.equal(extractSystemPromptFromPayload(payload), "DEV");
  // A leading user message is not a system prompt.
  assert.equal(
    extractSystemPromptFromPayload({
      messages: [{ role: "user", content: "x" }],
    }),
    null,
  );
});

test("extract: unrecognized payload returns null and md falls back to JSON", () => {
  const payload = { input: "something else", tools: [] };
  assert.equal(extractSystemPromptFromPayload(payload), null);
  const dump = renderProviderDump(HEADER, payload);
  assert.equal(dump.txt, null);
  assert.equal(
    dump.md,
    "# Provider system prompt (ground truth)\n\n" +
      "- timestamp: 2026-01-01-000000\n- provider: p\n- model: m\n\n" +
      "Unrecognized payload shape; raw payload follows.\n\n" +
      "```json\n" +
      JSON.stringify(payload, null, 2) +
      "\n```\n",
  );
  for (const odd of [null, undefined, 42, "text", []]) {
    assert.equal(extractSystemPromptFromPayload(odd), null);
    assert.equal(renderProviderDump(HEADER, odd).txt, null);
  }
});

test("extract: stringify-throwing payload renders the note plus String(payload)", () => {
  const payload: Record<string, unknown> = { input: "x" };
  payload.self = payload; // circular: JSON.stringify throws
  const dump = renderProviderDump(HEADER, payload);
  assert.equal(dump.txt, null);
  assert.equal(
    dump.md,
    "# Provider system prompt (ground truth)\n\n" +
      "- timestamp: 2026-01-01-000000\n- provider: p\n- model: m\n\n" +
      "Unrecognized payload shape; raw payload follows.\n\n" +
      "[object Object]\n",
  );
  assert.ok(!dump.md.includes("```"), "no fence in the String fallback");
});

test("provider dump: golden byte-compare", () => {
  const { input, expected } = golden("provider-dump");
  const { header, payload } = input as {
    header: typeof HEADER;
    payload: unknown;
  };
  const dump = renderProviderDump(header, payload);
  assert.equal(dump.md, expected);
  assert.equal(dump.txt, (payload as { system: string }).system);
});

test("wire pickup: selects the fresh POST record carrying pi's system prompt and renders it", async () => {
  const dir = tempDir();
  const write = (name: string, rec: unknown) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(rec));
  write("old-001.json", {
    method: "POST",
    url: "/v1/messages",
    body: { system: "core prompt" },
  });
  const before = listDir(dir);
  // HEAD probe, then the CLI's naming side call, then the real turn.
  write("new-001.json", { method: "HEAD", url: "/api/hello" });
  write("new-002.json", {
    method: "POST",
    url: "/v1/messages?beta=true",
    body: {
      model: "claude-haiku",
      system: [{ type: "text", text: "You are naming a coding session" }],
    },
  });
  assert.equal(findWireRecord(dir, before, "core prompt"), null);
  fs.writeFileSync(path.join(dir, "new-003.json"), "{not json");
  const pending = awaitWireRecord(dir, before, "core prompt", 2000, 20);
  setTimeout(() => {
    write("new-004.json", {
      method: "POST",
      url: "/v1/messages?beta=true",
      headers: { Authorization: "<redacted>" },
      body: {
        model: "claude-sonnet",
        system: [
          { type: "text", text: "x-anthropic-billing-header: cc_version=1" },
          { type: "text", text: "You are a Claude agent." },
          { type: "text", text: "core prompt\nmore" },
        ],
      },
    });
  }, 60);
  const hit = await pending;
  assert.ok(hit !== null);
  assert.equal(hit.file, "new-004.json");
  const dump = renderWireDump(
    {
      timestamp: "2026-01-01-000000",
      provider: "claude-go",
      modelId: "sonnet",
    },
    hit.file,
    hit.record,
    hit.system,
  );
  assert.equal(
    dump.txt,
    "x-anthropic-billing-header: cc_version=1\n\nYou are a Claude agent.\n\ncore prompt\nmore",
  );
  assert.match(
    dump.md,
    /- record: new-004\.json\n- request: POST \/v1\/messages\?beta=true\n- wire model: claude-sonnet\n- system blocks: 3\n/,
  );
  assert.match(dump.md, /```\nx-anthropic-billing-header/);
  // No needle: the first POST wins, whatever it says.
  assert.equal(findWireRecord(dir, before, null)?.file, "new-002.json");
  // Timeout returns null rather than hanging.
  assert.equal(
    await awaitWireRecord(dir, listDir(dir), "absent", 50, 10),
    null,
  );
});
