import assert from "node:assert/strict";
import { test } from "node:test";
import { splicePrompt } from "../lib/splice.ts";
import { STOCK_CORE } from "./stubs.ts";

const footer = "\nCurrent working directory: /work";
const skills =
  "\n\nThe following skills provide specialized instructions for specific tasks.\n" +
  "<available_skills>\n<skill>opaque</skill>\n</available_skills>";
const template =
  "CORE\n{{SKILLS}}\n{{APPENDED_INSTRUCTIONS}}\n<session_context>\n{{SESSION_CONTEXT}}\n</session_context>";

function rendered(result: ReturnType<typeof splicePrompt>): string {
  assert.ok("prompt" in result, JSON.stringify(result));
  return result.prompt;
}

test("session context consumes only Pi's exact footer and leaves extension additions unchanged", () => {
  const additions = "\n\nPRIOR ADDITION\nCurrent working directory: /elsewhere";
  const result = rendered(
    splicePrompt(template, STOCK_CORE + skills + footer + additions, {
      cwd: "/work",
    }),
  );
  assert.ok(result.includes("<skill>opaque</skill>"));
  assert.ok(
    result.endsWith(
      "<session_context>\nCurrent working directory: /work\n</session_context>" +
        additions,
    ),
  );
  assert.equal(result.split("Current working directory: /work").length, 2);
});

test("skills-like extension prose after the footer stays in the tail", () => {
  const result = rendered(
    splicePrompt(template, STOCK_CORE + footer + skills, { cwd: "/work" }),
  );
  assert.ok(result.endsWith("</session_context>" + skills));
  assert.equal(result.split("<skill>opaque</skill>").length, 2);
});

test("session context does not require relocating skills", () => {
  const result = rendered(
    splicePrompt(
      "<session_context>\n{{SESSION_CONTEXT}}\n</session_context>",
      STOCK_CORE + skills + footer + "\nEXTRA",
      { cwd: "/work" },
    ),
  );
  assert.equal(
    result,
    "<session_context>\nCurrent working directory: /work\n</session_context>" +
      skills +
      "\nEXTRA",
  );
});

test("session context follows Pi's Windows path normalization", () => {
  assert.equal(
    rendered(
      splicePrompt(
        "{{SESSION_CONTEXT}}",
        STOCK_CORE + "\nCurrent working directory: C:/work",
        {
          cwd: "C:\\work",
        },
      ),
    ),
    "Current working directory: C:/work",
  );
});

for (const [name, tail, cwd] of [
  ["missing footer", "", "/work"],
  ["wrong directory", "\nCurrent working directory: /other", "/work"],
  [
    "directory prefix only",
    "\nCurrent working directory: /work-extra",
    "/work",
  ],
  ["unrecognized prefix", skills + "\nUNKNOWN" + footer, "/work"],
  ["missing cwd input", footer, undefined],
] as const) {
  test(`session context fails open for ${name}`, () => {
    const result = splicePrompt(template, STOCK_CORE + tail, { cwd });
    assert.ok("reason" in result);
  });
}

test("explicit append text is opaque and appears once in its own section", () => {
  const append =
    "APPENDED EXACT\n{{SESSION_CONTEXT}} {{APPENDED_INSTRUCTIONS}}\n" +
    "Current working directory: /work\n<project_context> literal";
  const result = rendered(
    splicePrompt(template, STOCK_CORE + "\n\n" + append + skills + footer, {
      cwd: "/work",
      appendSystemPrompt: append,
    }),
  );
  assert.ok(
    result.includes(
      `<appended_instructions>\n${append}\n</appended_instructions>`,
    ),
  );
  assert.equal(result.split("APPENDED EXACT").length, 2);
});

for (const slot of ["SESSION_CONTEXT", "APPENDED_INSTRUCTIONS"]) {
  test(`repeated ${slot} fails open`, () => {
    assert.ok(
      "reason" in
        splicePrompt(`{{${slot}}}\n{{${slot}}}`, STOCK_CORE + footer, {
          cwd: "/work",
        }),
    );
  });
}

test("templates without new slots retain the original append and footer bytes", () => {
  const append = "APPEND\n{{SESSION_CONTEXT}}";
  assert.equal(
    rendered(
      splicePrompt("LEGACY", STOCK_CORE + "\n\n" + append + skills + footer, {
        appendSystemPrompt: append,
      }),
    ),
    "LEGACY\n\n" + append + skills + footer,
  );
});
