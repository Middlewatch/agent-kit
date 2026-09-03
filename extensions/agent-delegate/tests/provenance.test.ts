import assert from "node:assert/strict";
import test from "node:test";
import { extractCitations, provenanceFromToolResult, unmatchedCitations } from "../src/provenance.ts";

test("read provenance records normalized target, line interval, hash, and truncation", () => {
  const entry = provenanceFromToolResult({
    toolName: "inspect_read",
    input: { path: "./src/app.ts" },
    content: [{ type: "text", text: "10:const answer = 42;\n11:return answer;\n[inspection output truncated]" }],
    details: { truncated: true },
  });
  assert.equal(entry.target, "src/app.ts");
  assert.equal(entry.truncated, true);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(entry.references.at(-1), { kind: "file", target: "src/app.ts", startLine: 10, endLine: 11 });
});

test("citation audit distinguishes inspected ranges and fetched URLs from inventions", () => {
  const ledger = [
    provenanceFromToolResult({
      toolName: "inspect_read",
      input: { path: "src/app.ts" },
      content: [{ type: "text", text: "10:first\n11:second\n12:third" }],
    }),
    provenanceFromToolResult({
      toolName: "web_fetch",
      input: { url: "https://docs.example/start" },
      content: [{ type: "text", text: "documentation" }],
      details: { finalUrl: "https://docs.example/final#section" },
    }),
  ];
  assert.deepEqual(unmatchedCitations("See src/app.ts:11 and https://docs.example/final", ledger), []);
  assert.deepEqual(unmatchedCitations("See src/app.ts:99 and https://invented.example/fact", ledger), [
    { kind: "url", target: "https://invented.example/fact" },
    { kind: "file", target: "src/app.ts", startLine: 99, endLine: 99 },
  ]);
  assert.deepEqual(extractCitations("No concrete evidence citation here."), []);
});

test("Git diff provenance maps new-file hunks to citable source ranges", () => {
  const entry = provenanceFromToolResult({
    toolName: "inspect_git_diff",
    input: { staged: false },
    content: [{ type: "text", text: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -8,2 +8,3 @@\n old\n+new" }],
  });
  assert.ok(entry.references.some((reference) =>
    reference.kind === "file" && reference.target === "src/app.ts" && reference.startLine === 8 && reference.endLine === 10));
  assert.deepEqual(unmatchedCitations("See src/app.ts:9", [entry]), []);
});

test("strict audit sees multiple same-line citations and citations after the ledger entry cap", () => {
  const ledger = [provenanceFromToolResult({
    toolName: "inspect_read",
    input: { path: "src/grounded.ts" },
    content: [{ type: "text", text: "1:grounded" }],
  })];
  assert.deepEqual(unmatchedCitations("src/grounded.ts:1 and src/invented.ts:999", ledger), [
    { kind: "file", target: "src/invented.ts", startLine: 999, endLine: 999 },
  ]);
  const many = Array.from({ length: 20 }, (_, index) => `src/invented-${index}.ts:${index + 1}`).join(" ");
  assert.equal(unmatchedCitations(many, ledger).length, 17, "sixteen concrete misses plus an over-cap sentinel");
  assert.deepEqual(unmatchedCitations('{"citation":"src/grounded.ts:1"}', ledger), []);
});
