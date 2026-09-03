import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { THINKING_LEVELS, TIER_NAMES, loadTiers, parseTiers, resolveRoute } from "../src/tiers.ts";
import { resolveDelegateProfile } from "../src/profile.ts";

const TIERS = loadTiers(resolve(import.meta.dirname, "..", "tiers.json"));

test("tiers.json ships scout, analyst, and judge with fixed slugs", () => {
  assert.deepEqual(TIER_NAMES, ["scout", "analyst", "judge"]);
  assert.deepEqual(THINKING_LEVELS, ["low", "medium", "high"]);
  assert.deepEqual(TIERS, {
    scout: { model: "openai-codex/gpt-5.6-terra", thinking: "low" },
    analyst: { model: "openai-codex/gpt-5.6-sol", thinking: "medium" },
    judge: { model: "openai-codex/gpt-5.6-sol", thinking: "high" },
  });
});

test("profiles default explore to scout, review and research to analyst", () => {
  assert.equal(resolveDelegateProfile("explore").tier, "scout");
  assert.equal(resolveDelegateProfile("review").tier, "analyst");
  assert.equal(resolveDelegateProfile("research").tier, "analyst");
});

test("default route follows the profile tier", () => {
  assert.deepEqual(resolveRoute(TIERS, "scout", undefined, undefined), {
    tier: "scout",
    model: "openai-codex/gpt-5.6-terra",
    thinking: "low",
  });
  assert.deepEqual(resolveRoute(TIERS, "analyst", undefined, undefined), {
    tier: "analyst",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "medium",
  });
});

test("tier param reroutes model class and inherits the tier's thinking", () => {
  assert.deepEqual(resolveRoute(TIERS, "scout", "judge", undefined), {
    tier: "judge",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
  });
});

test("thinking param adjusts reasoning without changing the model", () => {
  assert.deepEqual(resolveRoute(TIERS, "analyst", undefined, "high"), {
    tier: "analyst",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
  });
  assert.deepEqual(resolveRoute(TIERS, "scout", "judge", "low"), {
    tier: "judge",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "low",
  });
});

test("unknown tier and thinking params fail closed", () => {
  assert.throws(() => resolveRoute(TIERS, "scout", "opus", undefined), /unsupported delegate tier: opus/);
  assert.throws(() => resolveRoute(TIERS, "scout", 3 as unknown, undefined), /unsupported delegate tier: 3/);
  assert.throws(() => resolveRoute(TIERS, "scout", undefined, "max"), /unsupported thinking level: max/);
});

test("malformed tier tables fail closed", () => {
  assert.throws(() => parseTiers("not json"), /tiers\.json: /);
  assert.throws(() => parseTiers("[]"), /tiers\.json: expected an object/);
  assert.throws(
    () => parseTiers(JSON.stringify({ scout: { model: "m", thinking: "low" }, analyst: { model: "m", thinking: "medium" } })),
    /tiers\.json: missing tier judge/,
  );
  assert.throws(
    () =>
      parseTiers(
        JSON.stringify({
          scout: { model: "m", thinking: "low" },
          analyst: { model: "m", thinking: "medium" },
          judge: { model: "m", thinking: "high" },
          oracle: { model: "m", thinking: "high" },
        }),
      ),
    /tiers\.json: unknown tier oracle/,
  );
  const withBad = (tier: object) =>
    JSON.stringify({ scout: { model: "m", thinking: "low" }, analyst: { model: "m", thinking: "medium" }, judge: tier });
  assert.throws(() => parseTiers(withBad({ model: "", thinking: "high" })), /tiers\.json: tier judge needs a non-empty model string/);
  assert.throws(() => parseTiers(withBad({ model: "m", thinking: "ultra" })), /tiers\.json: tier judge has invalid thinking: ultra/);
  assert.throws(() => parseTiers(withBad({ model: "m", thinking: "high", slug: "x" })), /tiers\.json: tier judge has unknown key slug/);
});
