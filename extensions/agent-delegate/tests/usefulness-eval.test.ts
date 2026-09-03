import assert from "node:assert/strict";
import test from "node:test";
import { scoreUsefulness } from "../src/usefulness-eval.ts";

const oracle = [
  { id: "AUTH_ASSIGNMENT", path: "src/auth.ts", line: 2 },
  { id: "CACHE_TENANT", path: "src/cache.ts", line: 4 },
];

test("usefulness scorer measures recall, false positives, citations, and correction", () => {
  assert.deepEqual(scoreUsefulness([
    { id: "AUTH_ASSIGNMENT", path: "src/auth.ts", line: 2, citation: "src/auth.ts:2" },
    { id: "INVENTED", path: "src/auth.ts", line: 99, citation: "src/auth.ts:99" },
  ], oracle), {
    defectRecall: 0.5,
    falsePositives: 1,
    supportedCitations: 1,
    unsupportedCitations: 1,
    correctedProvisionalClaim: true,
  });
});

test("empty findings preserve the deliberately wrong provisional claim", () => {
  assert.equal(scoreUsefulness([], oracle).correctedProvisionalClaim, false);
});

test("known ids with invented evidence do not earn recall or correction", () => {
  const score = scoreUsefulness(oracle.map(({ id }) => ({ id, path: "invented.ts", line: 999, citation: "invented.ts:999" })), oracle);
  assert.equal(score.defectRecall, 0);
  assert.equal(score.correctedProvisionalClaim, false);
  assert.equal(score.falsePositives, 2);
});
