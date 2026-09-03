import assert from "node:assert/strict";
import test from "node:test";
import { assertReturnSchema, extractJson, MAX_SCHEMA_BYTES, MAX_VALIDATION_ERRORS, validateReturn } from "../src/schema.ts";

const FINDING_SCHEMA = {
  type: "object",
  required: ["finding", "sourceUrl"],
  additionalProperties: false,
  properties: {
    finding: { type: "string", minLength: 1 },
    sourceUrl: { type: "string", minLength: 1 },
  },
};

test("subset schema accepted", () => {
  assertReturnSchema(FINDING_SCHEMA);
  // Every allowed keyword in one schema, nested through properties/items/additionalProperties.
  assertReturnSchema({
    type: "object",
    description: "full-subset schema",
    required: ["list"],
    additionalProperties: false,
    properties: {
      list: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            kind: { enum: ["a", "b"] },
            tag: { const: "fixed" },
            count: { type: "integer", minimum: 0, maximum: 10 },
            name: { type: "string", minLength: 1, maxLength: 40 },
          },
          additionalProperties: { type: "string" },
        },
      },
    },
  });
});

test("ref and allOf fail closed", () => {
  const offList = [
    { $ref: "#/defs/x" },
    { allOf: [{ type: "string" }] },
    { oneOf: [{ type: "string" }] },
    { anyOf: [{ type: "string" }] },
    { not: { type: "string" } },
    { patternProperties: { "^x": { type: "string" } } },
    { type: "string", format: "uri" },
  ];
  for (const schema of offList) {
    assert.throws(() => assertReturnSchema(schema), /outside the supported subset/, JSON.stringify(schema));
  }
  // Fail-closed is default-deny, not a blocklist: arbitrary unlisted keywords are rejected too.
  assert.throws(() => assertReturnSchema({ type: "object", title: "x" }), /keyword "title"/);
  assert.throws(
    () => assertReturnSchema({ type: "object", properties: { a: { type: "string", default: "y" } } }),
    /keyword "default" at #\/properties\/a/,
  );
  // Off-list keywords fail closed in nested positions too.
  assert.throws(
    () => assertReturnSchema({ type: "object", properties: { u: { type: "string", format: "uri" } } }),
    /keyword "format" at #\/properties\/u/,
  );
  assert.throws(
    () => assertReturnSchema({ type: "array", items: { $ref: "#/x" } }),
    /keyword "\$ref" at #\/items/,
  );
});

test("malformed keyword values fail closed at call time", () => {
  // Value.Check ignores an unrecognized type or a non-array enum, so the
  // value-domain guard must reject these before validation runs.
  const malformed: Array<[unknown, RegExp]> = [
    [{ type: "bogus" }, /"type" at # must be one of/],
    [{ type: "object", properties: { a: { type: "nope" } } }, /"type" at #\/properties\/a must be one of/],
    [{ enum: "not-an-array" }, /"enum" at # must be a non-empty array/],
    [{ enum: [] }, /"enum" at # must be a non-empty array/],
    [{ type: "object", required: ["a", 2] }, /"required" at # must be an array of property-name strings/],
    [{ type: "string", minLength: -1 }, /"minLength" at # must be a non-negative integer/],
    [{ type: "string", maxLength: 1.5 }, /"maxLength" at # must be a non-negative integer/],
    [{ type: "array", minItems: "x" }, /"minItems" at # must be a non-negative integer/],
    [{ type: "number", minimum: "x" }, /"minimum" at # must be a finite number/],
    [{ type: "number", maximum: Number.POSITIVE_INFINITY }, /"maximum" at # must be a finite number/],
    [{ type: "object", description: 7 }, /"description" at # must be a string/],
  ];
  for (const [schema, pattern] of malformed) {
    assert.throws(() => assertReturnSchema(schema), pattern, JSON.stringify(schema));
  }
  // const still accepts any JSON value.
  assertReturnSchema({ type: "object", properties: { k: { const: { nested: true } } } });
});

test("validateReturn classifies an unevaluatable schema as failed, never a silent pass", () => {
  // A hand-built object with a getter that throws during traversal must not
  // crash the parent or slip through as ok.
  const hostile: Record<string, unknown> = { type: "object" };
  Object.defineProperty(hostile, "properties", {
    enumerable: true,
    get() {
      throw new Error("boom");
    },
  });
  const verdict = validateReturn(hostile, { anything: true });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.errors[0], /could not be evaluated/);
});

test("non-object schemas are rejected", () => {
  for (const bad of [undefined, null, "schema", 7, [FINDING_SCHEMA]]) {
    assert.throws(() => assertReturnSchema(bad), /resultSchema must be a JSON Schema object/, String(bad));
  }
});

test("oversize schema rejected at 8193 bytes", () => {
  const pad = (length: number) => ({ type: "object", description: "x".repeat(length) });
  const overhead = Buffer.byteLength(JSON.stringify(pad(0)), "utf8");
  assertReturnSchema(pad(MAX_SCHEMA_BYTES - overhead)); // exactly 8192 bytes: accepted
  assert.throws(
    () => assertReturnSchema(pad(MAX_SCHEMA_BYTES - overhead + 1)), // exactly 8193 bytes
    /8193 bytes serialized; the cap is 8192 bytes/,
  );
});

test("extractJson accepts exactly one bare object and rejects wrappers", () => {
  const fenced = "Here is my answer:\n```json\n{\"finding\": \"LTS is 24\", \"sourceUrl\": \"https://nodejs.org\"}\n```\nHope that helps!";
  assert.equal(extractJson(fenced), undefined);

  const bare = 'Some preamble prose. {"finding": "a {nested} \\"quote\\"", "sourceUrl": "https://x.test"} Trailing prose.';
  assert.equal(extractJson(bare), undefined);

  const unfencedObject = '{"finding": "plain", "sourceUrl": "https://y.test"}';
  assert.deepEqual(extractJson(unfencedObject), { finding: "plain", sourceUrl: "https://y.test" });
  assert.equal(extractJson('{"finding":"one"}{"finding":"two"}'), undefined);

  assert.equal(extractJson("no json here at all"), undefined);
  assert.equal(extractJson("broken { \"finding\": } object"), undefined);
  assert.equal(extractJson("[1, 2, 3] is an array, not an object"), undefined);
});

test("invalid return lists errors", () => {
  const verdict = validateReturn(FINDING_SCHEMA, { finding: 42 });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.ok(verdict.errors.length >= 2, JSON.stringify(verdict.errors));
    assert.ok(verdict.errors.some((error) => error.includes("sourceUrl")), JSON.stringify(verdict.errors));
    assert.ok(verdict.errors.some((error) => error.includes("/finding")), JSON.stringify(verdict.errors));
  }
});

test("valid return passes", () => {
  assert.deepEqual(validateReturn(FINDING_SCHEMA, { finding: "yes", sourceUrl: "https://z.test" }), { ok: true });
});

test("validation diagnostics are capped", () => {
  const verdict = validateReturn({ type: "array", items: { type: "string" } }, Array.from({ length: 1000 }, () => 42));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.ok(verdict.errors.length > 0 && verdict.errors.length <= MAX_VALIDATION_ERRORS);
});
