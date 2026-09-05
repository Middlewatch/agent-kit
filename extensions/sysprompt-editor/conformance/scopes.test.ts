import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fixture } from "./fixture.ts";

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

test("real loader to recording provider: stock Pi stays stock, the editor renders scoped instructions", async () => {
  const stock = await fixture({ editor: false });
  const stockSystem = await stock.prompt();
  assert.match(stockSystem, /^You are an expert coding assistant/);
  assert.ok(
    stockSystem.includes("Project-specific instructions and guidelines:"),
  );

  const h = await fixture();
  const system = await h.prompt();
  assert.match(system, /^TEMPLATE CORE/);
  assert.ok(
    system.includes(
      `<global_instructions path="${join(h.agentDir, "AGENTS.md")}">\nGLOBAL OPAQUE\n\n</global_instructions>`,
    ),
  );
  assert.ok(
    system.includes(
      `<workspace_instructions path="${join(h.parent, "AGENTS.md")}" directory="${h.parent}">`,
    ),
  );
  assert.ok(
    system.includes(
      `<workspace_instructions path="${join(h.cwd, "AGENTS.md")}" directory="${h.cwd}">`,
    ),
  );
  assert.ok(system.indexOf("PARENT OPAQUE") < system.indexOf("NESTED OPAQUE"));
  assert.ok(!system.includes("Project-specific instructions and guidelines:"));
  assert.ok(!system.includes("<project_context>"));
  assert.equal(count(system, "<name>probe</name>"), 1);
});

test("custom core bypass leaves Pi's prompt untouched", async () => {
  const h = await fixture({ customPrompt: "CUSTOM CORE" });
  const system = await h.prompt();
  assert.match(system, /^CUSTOM CORE/);
  assert.equal(system, h.incoming.at(-1));
  assert.ok(!system.includes("TEMPLATE CORE"));
});

test("early placement consumes each scope once and keeps opaque prose, append, and extension additions", async () => {
  const globalContent =
    "GLOBAL OPAQUE\n```xml\n<project_context>\n{{WORKSPACE_INSTRUCTIONS}} {{SKILLS}}\nThe following skills provide specialized instructions\n</available_skills>\n```\n";
  const appended =
    "APPENDED EXACT\n{{GLOBAL_INSTRUCTIONS}}\n<project_context> literal";
  const h = await fixture({
    globalContent,
    appendSystemPrompt: appended,
    additions: true,
    template:
      "EARLY\n{{GLOBAL_INSTRUCTIONS}}\nMIDDLE\n{{WORKSPACE_INSTRUCTIONS}}\nLATE\n{{SKILLS}}",
  });
  const system = await h.prompt();
  assert.ok(system.includes(globalContent));
  assert.ok(system.includes(appended));
  assert.equal(count(system, "<name>probe</name>"), 1);
  assert.ok(system.indexOf("GLOBAL OPAQUE") < system.indexOf("MIDDLE"));
  assert.ok(system.indexOf("PARENT OPAQUE") > system.indexOf("MIDDLE"));
  assert.ok(system.indexOf("NESTED OPAQUE") < system.indexOf("LATE"));
  for (const text of [
    "GLOBAL OPAQUE",
    "PARENT OPAQUE",
    "NESTED OPAQUE",
    "APPENDED EXACT",
    "PRIOR ADDITION",
    "LATER ADDITION",
  ])
    assert.equal(count(system, text), 1, text);
});

for (const scope of ["GLOBAL", "WORKSPACE"]) {
  test(`omitted ${scope} slot retains that scoped block in the tail`, async () => {
    const h = await fixture({
      template: `CORE\n{{${scope === "GLOBAL" ? "WORKSPACE" : "GLOBAL"}_INSTRUCTIONS}}\nEND`,
    });
    const system = await h.prompt();
    const omitted = scope === "GLOBAL" ? "GLOBAL OPAQUE" : "PARENT OPAQUE";
    assert.ok(system.indexOf(omitted) > system.indexOf("END"));
    assert.ok(system.includes("<instruction_context>"));
    for (const text of ["GLOBAL OPAQUE", "PARENT OPAQUE", "NESTED OPAQUE"])
      assert.equal(count(system, text), 1, text);
  });
}

test("repeated instruction slot fails open without duplicate loaded content", async () => {
  const h = await fixture({
    template: "BAD\n{{GLOBAL_INSTRUCTIONS}}\n{{GLOBAL_INSTRUCTIONS}}",
  });
  const system = await h.prompt();
  assert.match(system, /^You are an expert coding assistant/);
  assert.ok(!system.includes("BAD"));
  assert.equal(count(system, "GLOBAL OPAQUE"), 1);
});
