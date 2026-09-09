import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fixture, kitRoot } from "./fixture.ts";

function once(text: string, value: string): void {
  assert.equal(text.split(value).length - 1, 1, value);
}

for (const name of ["owner.md", "default.md", "starter.md"]) {
  test(`${name}: XML layout preserves loaded instructions and live sections in the agreed order`, async () => {
    const template = readFileSync(
      new URL(`guidance/sysprompt/${name}`, kitRoot),
      "utf8",
    );
    const globalContent =
      "GLOBAL OPAQUE\n{{SESSION_CONTEXT}} {{APPENDED_INSTRUCTIONS}}\n";
    const append = "APPENDED EXACT\n{{SKILLS}} {{SESSION_CONTEXT}}";
    const h = await fixture({
      template,
      globalContent,
      appendSystemPrompt: append,
      additions: true,
    });
    const system = await h.prompt();
    assert.match(system, /^<role>\n/);
    let previous = -1;
    for (const boundary of [
      "<role>",
      "<global_instructions ",
      "<runtime>",
      "<available_tools>",
      "<runtime_guidelines>",
      "<available_skills>",
      "<pi_reference>",
      "</runtime>",
      "<appended_instructions>",
      "<workspace_instructions ",
      "<session_context>",
    ]) {
      const position = system.indexOf(boundary);
      assert.ok(position > previous, `${name}: ${boundary}`);
      previous = position;
    }
    for (const content of [
      globalContent,
      append,
      "PARENT OPAQUE",
      "NESTED OPAQUE",
      "<name>probe</name>",
      `Current working directory: ${h.cwd}`,
      "PRIOR ADDITION",
      "LATER ADDITION",
    ])
      once(system, content);
    assert.ok(
      system.indexOf("PARENT OPAQUE") < system.indexOf("NESTED OPAQUE"),
    );
    const sessionStart = system.lastIndexOf("<session_context>");
    const sessionEnd = system.lastIndexOf("</session_context>");
    assert.ok(
      system.indexOf(`Current working directory: ${h.cwd}`) > sessionStart,
    );
    assert.ok(
      system.indexOf(`Current working directory: ${h.cwd}`) < sessionEnd,
    );
    assert.ok(system.indexOf("PRIOR ADDITION") > sessionEnd);
    assert.ok(
      system.indexOf("LATER ADDITION") > system.indexOf("PRIOR ADDITION"),
    );
    assert.ok(!system.includes("{{PI_SCRATCHPAD}}"));
  });
}

test("optional append and absent skills leave no unresolved slots in the owner layout", async () => {
  const template = readFileSync(
    new URL("guidance/sysprompt/owner.md", kitRoot),
    "utf8",
  );
  const h = await fixture({
    template,
    afterEditor: [
      (pi) => pi.on("session_start", () => pi.setActiveTools(["grep"])),
    ],
  });
  const system = await h.prompt();
  assert.match(system, /^<role>\n/);
  assert.ok(!system.includes("<available_skills>"));
  assert.ok(!system.includes("<appended_instructions>"));
  assert.ok(!system.includes("{{"));
  assert.ok(system.endsWith("</session_context>"));
});

for (const slot of ["SESSION_CONTEXT", "APPENDED_INSTRUCTIONS"]) {
  test(`real pipeline preserves Pi's prompt when ${slot} is repeated`, async () => {
    const h = await fixture({ template: `BAD\n{{${slot}}}\n{{${slot}}}` });
    assert.equal(await h.prompt(), h.incoming.at(-1));
  });
}
