import assert from "node:assert/strict";
import test from "node:test";
import { DELEGATE_PROFILE_NAMES, POOL_LIMITS, resolveDelegateProfile } from "../src/profile.ts";

test("explore is the default delegate profile and rides the scout tier", () => {
  assert.deepEqual(DELEGATE_PROFILE_NAMES, ["explore", "review", "research"]);
  assert.deepEqual(resolveDelegateProfile(undefined), {
    name: "explore",
    tier: "scout",
    returnMode: "prose",
    webTools: false,
    scopeRequired: true,
    turnCap: 30,
    pool: "prose",
  });
});

test("review rides the analyst tier in the prose pool", () => {
  assert.deepEqual(resolveDelegateProfile("review"), {
    name: "review",
    tier: "analyst",
    returnMode: "prose",
    webTools: false,
    scopeRequired: true,
    turnCap: 30,
    pool: "prose",
  });
});

test("research rides the analyst tier in the typed pool with web tools", () => {
  assert.deepEqual(resolveDelegateProfile("research"), {
    name: "research",
    tier: "analyst",
    returnMode: "typed",
    webTools: true,
    scopeRequired: false,
    turnCap: 30,
    pool: "typed",
  });
});

test("pool limits are 3 prose 12 typed 2 writer", () => {
  assert.deepEqual(POOL_LIMITS, { prose: 3, typed: 12, writer: 2 });
});

test("unknown profiles fail closed", () => {
  assert.throws(() => resolveDelegateProfile("expensive"), /unsupported delegate profile: expensive/);
  assert.throws(() => resolveDelegateProfile(null), /unsupported delegate profile: null/);
});
