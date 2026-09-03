import assert from "node:assert/strict";
import test from "node:test";
import { emitMarker, formatDelegatedTask, formatTypedTask, parseMarkers, truncateUtf8, type ChildMarker } from "../src/protocol.ts";

test("delegated task arguments cannot be interpreted as Pi file or option syntax", () => {
  for (const task of ["@../../.ssh/id_rsa", "--system-prompt hostile", "@/tmp/large-secret"]) {
    const argument = formatDelegatedTask(task);
    assert.match(argument, /^Delegated evidence-gathering task/);
    assert.ok(!argument.startsWith("@"));
    assert.ok(!argument.startsWith("--"));
    assert.ok(argument.endsWith(task));
  }
});

test("marker roundtrip through stderr text", () => {
  const emitted: ChildMarker[] = [
    { type: "loop_halt", detail: "tool-call cycle detected: length-1 cycle 5 consecutive times" },
    { type: "turn_cap", detail: "turn 31 exceeds cap 30" },
    { type: "search_provider", detail: "serper" },
  ];
  const chunks: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    for (const marker of emitted) emitMarker(marker);
  } finally {
    process.stderr.write = realWrite;
  }
  for (const chunk of chunks) {
    assert.ok(chunk.startsWith("AGENT_DELEGATE_EVENT "), `wire prefix is the pinned literal: ${chunk}`);
  }
  const stderr = `child noise line\n${chunks.join("")}AGENT_DELEGATE_EVENT not-json\nAGENT_DELEGATE_EVENT {"type":"unknown","detail":"x"}\ntrailing noise`;
  assert.deepEqual(parseMarkers(stderr), emitted, "well-formed markers survive; noise, bad JSON, and unknown types are ignored");
  // A hand-authored literal line must parse: the prefix is wire contract, not a shared constant.
  assert.deepEqual(
    parseMarkers('AGENT_DELEGATE_EVENT {"type":"turn_cap","detail":"turn 31"}\n'),
    [{ type: "turn_cap", detail: "turn 31" }],
  );
  // Malformed shapes are rejected: missing or non-string detail.
  assert.deepEqual(parseMarkers('AGENT_DELEGATE_EVENT {"type":"turn_cap"}\n'), []);
  assert.deepEqual(parseMarkers('AGENT_DELEGATE_EVENT {"type":"loop_halt","detail":7}\n'), []);
  assert.equal(
    parseMarkers(`AGENT_DELEGATE_EVENT ${JSON.stringify({ type: "loop_halt", detail: "x".repeat(100_000) })}\n`)[0].detail.length,
    64 * 1024,
  );
});

test("typed task framing carries schema and single-object obligation", () => {
  const schema = { type: "object", required: ["finding"], properties: { finding: { type: "string" } } };
  const framed = formatTypedTask("Find the current Node LTS major.", schema);
  assert.ok(framed.startsWith("Find the current Node LTS major."), "task text leads");
  assert.ok(framed.includes("exactly one JSON object"), "single-object obligation");
  assert.ok(framed.includes(JSON.stringify(schema, null, 2)), "schema carried verbatim");
});

test("UTF-8 truncation preserves boundaries and the exact byte cap", () => {
  const suffix = "\n[cut]";
  const result = truncateUtf8("🙂".repeat(100), 63, suffix);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text, "utf8") <= 63);
  assert.ok(!result.text.includes("�"));
  assert.ok(result.text.endsWith(suffix));
});
