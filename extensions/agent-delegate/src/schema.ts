import { Value } from "typebox/value";

export const MAX_SCHEMA_BYTES = 8192;
export const MAX_VALIDATION_ERRORS = 16;
const MAX_VALIDATION_ERROR_CHARS = 300;

/** The documented caller-schema subset; any keyword off this list fails closed at call time. */
export const ALLOWED_SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "description",
  "additionalProperties",
]);

/** JSON Schema primitive types TypeBox's Value.Check enforces for a plain node. */
export const KNOWN_SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Caller schemas are restricted to the documented keyword subset; unsupported
 * keywords ($ref, allOf, oneOf, anyOf, not, patternProperties, format, and
 * anything else off-list) fail closed here, at call time. Serialized size is
 * capped at 8 192 bytes.
 */
export function assertReturnSchema(schema: unknown): asserts schema is object {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("resultSchema must be a JSON Schema object");
  }
  const serialized = JSON.stringify(schema);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_SCHEMA_BYTES) {
    throw new Error(`resultSchema is ${bytes} bytes serialized; the cap is ${MAX_SCHEMA_BYTES} bytes`);
  }
  assertSchemaNode(schema, "#");
}

function assertSchemaNode(node: unknown, path: string): void {
  if (!isPlainObject(node)) {
    throw new Error(`resultSchema node at ${path} must be an object`);
  }
  for (const [keyword, value] of Object.entries(node)) {
    if (!ALLOWED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new Error(
        `resultSchema keyword "${keyword}" at ${path} is outside the supported subset: ${[...ALLOWED_SCHEMA_KEYWORDS].join(", ")}`,
      );
    }
    // Keyword names alone are not enough: a malformed value ("type":"bogus",
    // "enum":"not-an-array") is silently ignored by Value.Check and would let
    // any payload pass, defeating the caller's contract. Validate each
    // keyword's shape and domain here so the guarantee is real at call time.
    switch (keyword) {
      case "type":
        if (typeof value !== "string" || !KNOWN_SCHEMA_TYPES.has(value)) {
          throw new Error(`resultSchema "type" at ${path} must be one of ${[...KNOWN_SCHEMA_TYPES].join(", ")}`);
        }
        break;
      case "properties":
        if (!isPlainObject(value)) {
          throw new Error(`resultSchema "properties" at ${path} must be an object of schemas`);
        }
        for (const [name, subSchema] of Object.entries(value)) {
          assertSchemaNode(subSchema, `${path}/properties/${name}`);
        }
        break;
      case "items":
        assertSchemaNode(value, `${path}/items`);
        break;
      case "additionalProperties":
        if (typeof value !== "boolean") assertSchemaNode(value, `${path}/additionalProperties`);
        break;
      case "required":
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
          throw new Error(`resultSchema "required" at ${path} must be an array of property-name strings`);
        }
        break;
      case "enum":
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error(`resultSchema "enum" at ${path} must be a non-empty array`);
        }
        break;
      case "minimum":
      case "maximum":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`resultSchema "${keyword}" at ${path} must be a finite number`);
        }
        break;
      case "minLength":
      case "maxLength":
      case "minItems":
      case "maxItems":
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
          throw new Error(`resultSchema "${keyword}" at ${path} must be a non-negative integer`);
        }
        break;
      case "description":
        if (typeof value !== "string") {
          throw new Error(`resultSchema "description" at ${path} must be a string`);
        }
        break;
      case "const":
        // Any JSON value is a valid const; no domain constraint applies.
        break;
    }
  }
}

/** Parse exactly one bare JSON object; prose, fences, arrays, and trailing data fail closed. */
export function extractJson(text: string): unknown | undefined {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function validateReturn(schema: object, value: unknown): { ok: true } | { ok: false; errors: string[] } {
  try {
    if (Value.Check(schema, value)) return { ok: true };
    const errors = [...Value.Errors(schema, value)].slice(0, MAX_VALIDATION_ERRORS).map((error) => {
      const path = typeof error.instancePath === "string" && error.instancePath ? error.instancePath : "/";
      return `${path}: ${error.message}`.slice(0, MAX_VALIDATION_ERROR_CHARS);
    });
    return { ok: false, errors: errors.length ? errors : ["value does not match resultSchema"] };
  } catch (error) {
    // A schema the keyword guard admits but TypeBox still cannot evaluate is a
    // terminal validation failure, never a silent pass.
    return { ok: false, errors: [`resultSchema could not be evaluated: ${error instanceof Error ? error.message : String(error)}`.slice(0, MAX_VALIDATION_ERROR_CHARS)] };
  }
}
