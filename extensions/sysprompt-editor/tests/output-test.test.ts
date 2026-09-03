/**
 * Unit tests for lib/output-test.ts: the pinned prompt assembly, result
 * naming, the golden result serialization, and assistant text extraction.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import test from "node:test";
import {
  OUTPUT_TEST_PROMPT,
  assistantText,
  buildTestMessage,
  formatResult,
  resultBase,
  type ResultHeader,
} from "../lib/output-test.ts";

const GOLDEN = new URL("../fixtures/golden/", import.meta.url);

test("prompt: fixture embedded verbatim after pinned instructions", () => {
  assert.equal(OUTPUT_TEST_PROMPT, "Summarize this article for me.");
  const fixture = "# Title\n\nBody with ```code``` and trailing newline\n";
  assert.equal(
    buildTestMessage(fixture),
    "Summarize this article for me.\n\n---\n\n" + fixture,
  );
  // The committed fixture rides through the same assembly byte for byte.
  const real = fs.readFileSync(
    new URL("../fixtures/output-test-document.md", import.meta.url),
    "utf8",
  );
  assert.ok(buildTestMessage(real).endsWith(real));
});

test("result: resultBase carries stamp, sanitized provider and model id", () => {
  assert.equal(
    resultBase("2026-01-02-030405", "anthropic", "claude-sonnet-4-5"),
    "2026-01-02-030405-anthropic-claude-sonnet-4-5",
  );
  assert.equal(
    resultBase("2026-01-02-030405", "open router", "anthropic/claude:v2 x"),
    "2026-01-02-030405-open-router-anthropic-claude-v2-x",
  );
  assert.equal(resultBase("s", "unknown", "unknown"), "s-unknown-unknown");
  assert.ok(!resultBase("s", "p", "m").endsWith(".md"), "no extension");
});

test("result: golden byte-compare", () => {
  const { header, responseText } = JSON.parse(
    fs.readFileSync(new URL("output-test-result.input.json", GOLDEN), "utf8"),
  ) as { header: ResultHeader; responseText: string };
  const expected = fs.readFileSync(
    new URL("output-test-result.md", GOLDEN),
    "utf8",
  );
  assert.equal(formatResult(header, responseText), expected);
  // Fail-open twin: "(stock)" and no sha line.
  assert.equal(
    formatResult(
      { ...header, activeTemplate: "(stock)", templateSha256: null },
      "reply",
    ),
    "# Output test\n\n- timestamp: 2026-08-17-150000\n- provider: anthropic\n" +
      "- model: claude-sonnet-4-5\n- template: (stock)\n\n---\n\nreply\n",
  );
});

test("result: assistant text blocks joined, non-text blocks ignored", () => {
  const message = {
    role: "assistant",
    content: [
      { type: "text", text: "First." },
      { type: "toolCall", id: "t1", name: "read", arguments: { path: "x" } },
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "Second.\n" },
    ],
  };
  assert.equal(assistantText(message), "First.\n\nSecond.\n");
  assert.equal(assistantText({ role: "assistant", content: [] }), "");
  assert.equal(
    assistantText({ role: "assistant", content: [{ type: "toolCall" }] }),
    "",
  );
  assert.equal(assistantText({ role: "assistant" }), "");
  assert.equal(assistantText(undefined), "");
});
