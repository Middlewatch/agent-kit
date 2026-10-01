/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DECLINE_MESSAGE, formatResult, normalizeQuestions, type Question, Questionnaire, scrollStart, tabWindow, validateQuestions } from "./lib.ts";

const option = (label: string, preview?: string) => ({ label, description: `${label} described`, ...(preview ? { preview } : {}) });
const single: Question = { question: "Which library?", header: "Library", options: [option("Zod"), option("Valibot")] };
const multi: Question = { question: "Which checks?", header: "Checks", options: [option("Unit"), option("Lint"), option("Types")], multiSelect: true };
const third: Question = { question: "Ship it?", header: "Ship", options: [option("Yes"), option("No")] };

test("normalizeQuestions strips carriage returns from every shown string", () => {
  const [q] = normalizeQuestions([{ question: "A\rB?", header: "H\r\n", options: [{ label: "L\r", description: "d\r\ne", preview: "p\r\nq" }, option("M")] }]);
  assert.deepEqual([q!.question, q!.header, q!.options[0]], ["AB?", "H\n", { label: "L", description: "d\ne", preview: "p\nq" }]);
  assert.equal("preview" in q!.options[1]!, false);
});

test("validateQuestions reports the first problem", () => {
  assert.equal(validateQuestions([single, multi]), undefined);
  assert.match(validateQuestions([])!, /at least one question/);
  assert.match(validateQuestions([single, single])!, /unique within a call/);
  assert.match(validateQuestions([{ ...single, options: [option("Zod")] }])!, /at least 2 options/);
  assert.match(validateQuestions([{ ...single, options: [option("Zod"), option("Other")] }])!, /"Other" is reserved/);
  assert.match(validateQuestions([{ ...single, options: [option("Zod"), option("Zod")] }])!, /labels must be unique/);
});

test("a single question finishes on its first answer", () => {
  const q = new Questionnaire([single]);
  assert.equal(q.tabbed, false);
  q.move(1);
  q.confirm();
  assert.deepEqual(q.result, { answers: [{ questionIndex: 0, question: "Which library?", kind: "option", answer: "Valibot" }], cancelled: false });
  assert.equal(formatResult(q.result!, [single]), 'User answers:\n- "Which library?" = "Valibot"');
});

test("rows are the options, the free-text row, and Next on multi-select; focus wraps", () => {
  const q = new Questionnaire([multi]);
  assert.deepEqual(q.rows().map((row) => row.kind), ["option", "option", "option", "other", "next"]);
  q.move(-1);
  assert.equal(q.focused?.kind, "next");
  q.move(1);
  assert.deepEqual(q.focused, { kind: "option", index: 0 });
});

test("answering advances through the tabs to Submit, which submits", () => {
  const q = new Questionnaire([single, third]);
  q.confirm();
  assert.equal(q.tab, 1);
  q.confirm();
  assert.equal(q.onSubmitTab, true);
  assert.deepEqual(q.unanswered(), []);
  q.confirm();
  assert.deepEqual(q.result?.answers.map((a) => a.answer), ["Zod", "Yes"]);
  assert.equal(q.result?.cancelled, false);
});

test("the Submit tab's second row cancels, and a partial submission names what was skipped", () => {
  const cancelled = new Questionnaire([single, third]);
  cancelled.switchTab(-1);
  assert.equal(cancelled.onSubmitTab, true);
  cancelled.move(1);
  cancelled.confirm();
  assert.equal(cancelled.result?.cancelled, true);
  assert.equal(formatResult(cancelled.result!, [single, third]), DECLINE_MESSAGE);

  const partial = new Questionnaire([single, third]);
  partial.confirm();
  partial.switchTab(1);
  assert.deepEqual(partial.unanswered(), ["Ship"]);
  partial.confirm();
  assert.equal(formatResult(partial.result!, [single, third]), 'User answers:\n- "Which library?" = "Zod"\n- "Ship it?" = (not answered)');
});

test("multi-select: space and enter flip boxes, Next commits, an empty set is no answer", () => {
  const q = new Questionnaire([multi, third]);
  q.toggle();
  q.move(2);
  q.confirm();
  assert.equal(q.tab, 0, "enter on an option toggles instead of advancing");
  assert.deepEqual(q.answers.get(0)?.selected, ["Unit", "Types"]);
  assert.equal(q.isChecked(0, 2), true);
  q.toggle();
  q.move(-2);
  q.toggle();
  assert.equal(q.answers.has(0), false);
  q.toggle();
  q.move(-1);
  assert.equal(q.focused?.kind, "next");
  q.confirm();
  assert.equal(q.tab, 1);
  assert.deepEqual(q.answers.get(0), { questionIndex: 0, question: "Which checks?", kind: "multi", answer: null, selected: ["Unit"] });
});

test("a typed answer replaces the checkboxes, survives Next with nothing checked, and can be withdrawn", () => {
  const q = new Questionnaire([multi]);
  q.toggle();
  q.move(3);
  assert.equal(q.typing, true);
  q.setDraft("only e2e");
  q.confirm();
  assert.deepEqual(q.result?.answers[0], { questionIndex: 0, question: "Which checks?", kind: "custom", answer: "only e2e" });
  assert.equal(formatResult(q.result!, [multi]), 'User answers:\n- "Which checks?" = "only e2e"');

  const tabbed = new Questionnaire([multi, third]);
  tabbed.move(3);
  tabbed.setDraft("typed");
  tabbed.confirm();
  tabbed.switchTab(-1);
  assert.equal(tabbed.isChecked(0, 0), false);
  tabbed.move(-1);
  tabbed.confirm();
  assert.equal(tabbed.answers.get(0)?.answer, "typed", "Next with no boxes keeps the typed answer");
  tabbed.switchTab(-1);
  tabbed.move(3);
  assert.equal(tabbed.draft(), "typed");
  tabbed.setDraft("  ");
  tabbed.confirm();
  assert.equal(tabbed.answers.has(0), false);
  assert.equal(tabbed.tab, 0, "an empty draft does not advance");
});

test("drafts are kept per tab while the user looks elsewhere", () => {
  const q = new Questionnaire([single, third]);
  q.move(2);
  q.setDraft("half a thought");
  q.switchTab(1);
  assert.equal(q.draft(), "");
  q.switchTab(-1);
  assert.equal(q.draft(), "half a thought");
  assert.equal(q.answers.has(0), false);
});

test("notes attach to an answer made before or after them and do not count as an answer", () => {
  const q = new Questionnaire([single, third]);
  assert.equal(q.openNotes(), "");
  q.closeNotes("  prefer v4 ");
  assert.equal(q.notesOpen, false);
  assert.deepEqual(q.unanswered(), ["Library", "Ship"]);
  q.confirm();
  assert.equal(q.answers.get(0)?.notes, "prefer v4");

  q.confirm();
  q.switchTab(-1);
  assert.equal(q.openNotes(), "");
  q.closeNotes("after the fact");
  assert.equal(q.answers.get(1)?.notes, "after the fact");
  q.openNotes();
  q.closeNotes("");
  assert.equal("notes" in q.answers.get(1)!, false);
});

test("a note on the Submit tab is the global note, and alone it still counts as a reply", () => {
  const q = new Questionnaire([single, third]);
  q.switchTab(-1);
  q.openNotes();
  q.closeNotes("none of these fit");
  assert.equal(q.note(), "none of these fit");
  q.confirm();
  assert.deepEqual(q.result, { answers: [], cancelled: false, globalNote: "none of these fit" });
  assert.equal(
    formatResult(q.result!, [single, third]),
    'User answers:\n- "Which library?" = (not answered)\n- "Ship it?" = (not answered)\nNote for the whole questionnaire: none of these fit',
  );
});

test("formatResult carries notes and declines an empty or cancelled result", () => {
  const q = new Questionnaire([single]);
  q.openNotes();
  q.closeNotes("v4");
  q.confirm();
  assert.equal(formatResult(q.result!, [single]), 'User answers:\n- "Which library?" = "Zod"; user notes: v4');
  assert.equal(formatResult({ answers: [], cancelled: false }, [single]), DECLINE_MESSAGE);
  const cancelled = new Questionnaire([single]);
  cancelled.cancel();
  assert.equal(formatResult(cancelled.result!, [single]), DECLINE_MESSAGE);
});

test("tabWindow shows everything that fits, else the run around the active tab", () => {
  assert.deepEqual(tabWindow([10, 10, 10], 0, 80), [0, 2]);
  // Six 10-wide tabs need 70 columns; 40 holds three at an end, or two with an ellipsis on each side.
  assert.deepEqual(tabWindow([10, 10, 10, 10, 10, 10], 0, 40), [0, 2]);
  assert.deepEqual(tabWindow([10, 10, 10, 10, 10, 10], 2, 40), [2, 3]);
  assert.deepEqual(tabWindow([10, 10, 10, 10, 10, 10], 5, 40), [3, 5]);
  assert.deepEqual(tabWindow([10, 10, 10], 1, 5), [1, 1]);
});

test("scrollStart centers the focused rows and stays inside the body", () => {
  assert.equal(scrollStart(undefined, 10, 40), 0);
  assert.equal(scrollStart([0, 2], 10, 40), 0);
  assert.equal(scrollStart([20, 22], 10, 40), 16);
  assert.equal(scrollStart([38, 40], 10, 40), 30);
});
