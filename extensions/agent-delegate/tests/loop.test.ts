import assert from "node:assert/strict";
import test from "node:test";
import { CYCLE_MAX_LEN, CYCLE_REPEAT_THRESHOLD, ERROR_STREAK_HALT, ERROR_STREAK_NUDGE, LoopDetector } from "../src/loop.ts";

test("pinned thresholds hold their ruled values", () => {
  assert.equal(CYCLE_MAX_LEN, 5);
  assert.equal(CYCLE_REPEAT_THRESHOLD, 5);
  assert.equal(ERROR_STREAK_NUDGE, 3);
  assert.equal(ERROR_STREAK_HALT, 4);
});

// Traces are synthetic: each deterministically exercises one loop class the
// detector must catch or must ignore.

test("five identical calls halt", () => {
  const detector = new LoopDetector();
  const args = { path: "src/index.ts" };
  for (let call = 1; call < CYCLE_REPEAT_THRESHOLD; call += 1) {
    assert.deepEqual(detector.observeCall("inspect_read", args), { kind: "ok" }, `call ${call}`);
    detector.observeResult("inspect_read", args, false, "file contents");
  }
  const verdict = detector.observeCall("inspect_read", args);
  assert.equal(verdict.kind, "halt");
  if (verdict.kind === "halt") assert.match(verdict.reason, /length-1 cycle 5 consecutive times/);
});

test("abab cycle halts at threshold", () => {
  const detector = new LoopDetector();
  const a = ["inspect_grep", { pattern: "foo" }] as const;
  const b = ["inspect_read", { path: "a.ts" }] as const;
  for (let round = 1; round <= 10; round += 1) {
    const [name, args] = round % 2 === 1 ? a : b;
    const verdict = detector.observeCall(name, args);
    detector.observeResult(name, args, false, "result");
    if (round < 10) {
      assert.deepEqual(verdict, { kind: "ok" }, `round ${round}`);
    } else {
      assert.equal(verdict.kind, "halt", `round ${round}`);
      if (verdict.kind === "halt") assert.match(verdict.reason, /length-2 cycle 5 consecutive times/);
    }
  }
});

test("error streak of three nudges once", () => {
  const detector = new LoopDetector();
  const args = { url: "https://dead.test/page" };
  for (let call = 1; call <= 3; call += 1) {
    assert.deepEqual(detector.observeCall("web_fetch", args), { kind: "ok" }, `call ${call}`);
    detector.observeResult("web_fetch", args, true, "HTTP 403");
  }
  const verdict = detector.observeCall("web_fetch", args);
  assert.equal(verdict.kind, "nudge");
  if (verdict.kind === "nudge") assert.match(verdict.message, /failed 3 times in a row/);
});

test("unchanged call after the nudge halts", () => {
  const detector = new LoopDetector();
  const args = { url: "https://dead.test/page" };
  for (let call = 1; call <= 3; call += 1) {
    detector.observeCall("web_fetch", args);
    detector.observeResult("web_fetch", args, true, "HTTP 403");
  }
  assert.equal(detector.observeCall("web_fetch", args).kind, "nudge");
  const verdict = detector.observeCall("web_fetch", args);
  assert.equal(verdict.kind, "halt");
  if (verdict.kind === "halt") assert.match(verdict.reason, /re-issued unchanged after the corrective nudge/);
  // Halt is sticky: every later call keeps the halt verdict.
  assert.equal(detector.observeCall("inspect_ls", { path: "." }).kind, "halt");
});

test("length-5 cycle halts and length-6 does not", () => {
  const five = new LoopDetector();
  for (let round = 0; round < 25; round += 1) {
    const args = { path: `file-${round % 5}.ts` };
    const verdict = five.observeCall("inspect_read", args);
    five.observeResult("inspect_read", args, false, "ok");
    assert.equal(verdict.kind, round < 24 ? "ok" : "halt", `round ${round}`);
  }

  const six = new LoopDetector();
  for (let round = 0; round < 36; round += 1) {
    const args = { path: `file-${round % 6}.ts` };
    assert.deepEqual(six.observeCall("inspect_read", args), { kind: "ok" }, `round ${round}`);
    six.observeResult("inspect_read", args, false, "ok");
  }
});

test("distinct-file batch of similar calls does not fire", () => {
  const detector = new LoopDetector();
  for (let file = 0; file < 12; file += 1) {
    const args = { path: `src/module-${file}.ts` };
    assert.deepEqual(detector.observeCall("inspect_read", args), { kind: "ok" }, `file ${file}`);
    detector.observeResult("inspect_read", args, false, "contents");
  }
});

test("changed arguments reset the streak", () => {
  const detector = new LoopDetector();
  const dead = { url: "https://dead.test/page" };
  for (let call = 1; call <= 3; call += 1) {
    detector.observeCall("web_fetch", dead);
    detector.observeResult("web_fetch", dead, true, "HTTP 403");
  }
  // Changed arguments: no nudge, and the streak restarts on the new key.
  const changed = { url: "https://alive.test/other" };
  assert.deepEqual(detector.observeCall("web_fetch", changed), { kind: "ok" });
  detector.observeResult("web_fetch", changed, true, "HTTP 500");
  // The original key's streak is gone: three more errors are needed before any nudge.
  assert.deepEqual(detector.observeCall("web_fetch", dead), { kind: "ok" });
});
