import assert from "node:assert/strict";
import test from "node:test";
import {
  captureRequest,
  parseRequest,
  requestSections,
} from "../lib/viewer.ts";

const model = { provider: "fixture", id: "one" };

test("capture owns a detached JSON snapshot and preserves all request fields", () => {
  const payload = {
    system: [{ type: "text", text: "CORE\n" }],
    messages: [{ role: "user", content: "QUESTION" }],
    tools: [{ name: "probe", description: "TOOL INSTRUCTION" }],
    extra: { policy: "EXTRA" },
  };
  const record = captureRequest(payload, model, "KNOWN SOURCES", "now");
  assert.equal(record.kind, "captured");
  if (record.kind !== "captured") return;
  payload.system[0]!.text = "MUTATED";
  assert.equal(JSON.parse(record.json).system[0].text, "CORE\n");
  assert.deepEqual(parseRequest(JSON.parse(JSON.stringify(record))), record);
  const sections = requestSections(record);
  assert.match(sections.instructions, /CORE/);
  assert.match(sections.messages, /QUESTION/);
  assert.match(sections.tools, /TOOL INSTRUCTION/);
  assert.match(sections.raw, /EXTRA/);
  assert.equal(sections.sources, "KNOWN SOURCES");
});

test("instruction view includes every system/developer item without hiding other roles", () => {
  const record = captureRequest(
    {
      instructions: "TOP LEVEL",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: "SECOND" }],
        },
        { role: "user", content: "USER" },
        { role: "system", content: "THIRD" },
      ],
      messages: [{ role: "developer", content: "FOURTH" }],
      config: {
        systemInstruction: { parts: [{ text: "GEMINI" }] },
        tools: [{ functionDeclarations: [{ name: "tool" }] }],
      },
    },
    model,
    "",
    "now",
  );
  const sections = requestSections(record);
  for (const text of ["TOP LEVEL", "SECOND", "THIRD", "FOURTH", "GEMINI"])
    assert.ok(sections.instructions.includes(text), text);
  assert.match(sections.messages, /USER/);
  assert.match(sections.tools, /functionDeclarations/);
});

test("unknown shapes retain raw input and do not pretend instructions were found", () => {
  const sections = requestSections(
    captureRequest({ unusual: "OPAQUE" }, model, "", "now"),
  );
  assert.match(sections.instructions, /not recognized/i);
  assert.match(sections.raw, /OPAQUE/);
});

test("uncapturable payloads and malformed saved entries are explicit", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(captureRequest(cyclic, model, "", "now").kind, "unavailable");
  assert.equal(captureRequest(undefined, model, "", "now").kind, "unavailable");
  assert.equal(parseRequest({ version: 9 }), null);
  assert.equal(parseRequest({ version: 1, kind: "captured", json: "{" }), null);
});
