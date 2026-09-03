/**
 * Absorption proof: twelve concurrent typed children each saturating the
 * complete 24 KiB model-visible result stay within the 12 × 24 KiB = 288 KiB
 * parent-side total. The bound includes the separate assessment-id text block;
 * oversize is a typed failure, never a truncation. Stub children
 * via the AGENT_DELEGATE_CHILD_CMD seam; zero live network calls.
 *
 * The falsification witness runs against this file: with
 * AGENT_DELEGATE_STUB_TARGET_BYTES=25600 exported, every stub returns 25 KiB
 * and the run must fail with typed-oversize errors — not parent-side growth.
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import agentDelegate from "../index.ts";

const MAX_RESULT_BYTES = 24 * 1024;
const ASSESSMENT_REFERENCE = `Delegation ID for assess_delegation: ${"0".repeat(36)}`;
const MAX_TYPED_PAYLOAD_BYTES = MAX_RESULT_BYTES - Buffer.byteLength(`\n${ASSESSMENT_REFERENCE}`, "utf8");

// The stub emits its final return already pretty-printed in exactly the
// JSON.stringify(value, null, 2) shape the parent delivers. Its default target
// leaves exactly enough room for Pi's newline and the fixed-width UUID block.
const STUB_SOURCE = `const isRepair = !process.argv.includes("--mode");
const target = Number(process.env.AGENT_DELEGATE_STUB_TARGET_BYTES ?? ${MAX_TYPED_PAYLOAD_BYTES});
const skeleton = JSON.stringify({ finding: "", sourceUrl: "https://example.test/max" }, null, 2);
const payload = JSON.stringify(
  { finding: "A".repeat(Math.max(0, target - skeleton.length)), sourceUrl: "https://example.test/max" },
  null,
  2,
);
if (isRepair) {
  process.stdout.write(payload);
} else {
  process.stdout.write(JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      stopReason: "stop",
      content: [{ type: "text", text: payload }],
      usage: { input: 12, output: 7, cacheRead: 0, cacheWrite: 0, cost: { total: 0.001 }, totalTokens: 19 },
    },
  }) + "\\n");
}
`;

const stubDir = mkdtempSync(join(tmpdir(), "agent-delegate-absorb-"));
writeFileSync(join(stubDir, "stub-child.mjs"), STUB_SOURCE);

const tools = new Map<string, any>();
const api = {
  registerTool(definition: any) { tools.set(definition.name, definition); },
  registerCommand() {},
  on() {},
} as unknown as ExtensionAPI;
agentDelegate(api);
const delegateTool = tools.get("delegate");

const ctx = { cwd: process.cwd(), ui: { setStatus() {}, setWidget() {}, notify() {} } } as any;

const TASK =
  "Return one maximally sized typed finding so the parent can prove its return-absorption bound at exactly the cap.";

const SCHEMA = {
  type: "object",
  required: ["finding", "sourceUrl"],
  properties: { finding: { type: "string" }, sourceUrl: { type: "string" } },
};

test("twelve typed children at max visible result stay within 288 KiB parent-side total", async () => {
  const saved = {
    AGENT_DELEGATE_CHILD_CMD: process.env.AGENT_DELEGATE_CHILD_CMD,
    AGENT_DELEGATE_RECORDS_DIR: process.env.AGENT_DELEGATE_RECORDS_DIR,
  };
  process.env.AGENT_DELEGATE_CHILD_CMD = `${process.execPath} ${join(stubDir, "stub-child.mjs")}`;
  process.env.AGENT_DELEGATE_RECORDS_DIR = mkdtempSync(join(tmpdir(), "agent-delegate-absorb-records-"));
  try {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        delegateTool.execute(
          `absorb-${index}`,
          { profile: "research", label: `absorb-${index}`, task: TASK, resultSchema: SCHEMA },
          undefined,
          undefined,
          ctx,
        ) as Promise<any>,
      ),
    );
    const visibleBytes = (result: any) => Buffer.byteLength(
      result.content.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n"),
      "utf8",
    );
    for (const result of results) {
      assert.equal(Buffer.byteLength(result.content[0].text, "utf8"), MAX_TYPED_PAYLOAD_BYTES);
      assert.equal(visibleBytes(result), MAX_RESULT_BYTES, "each child really saturated its 24 KiB visible result");
    }
    const total = results.reduce((sum, result) => sum + visibleBytes(result), 0);
    assert.ok(total <= 12 * MAX_RESULT_BYTES, `parent-side total ${total} bytes exceeds the 288 KiB absorption bound`);
    assert.equal(total, 12 * MAX_RESULT_BYTES, "the proof exercises the bound at equality, not below it");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
