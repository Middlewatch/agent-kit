import { expect, test } from "vitest";
import { join } from "node:path";
import { fixture } from "./fixture.ts";

test.each([false, true])(
  "real loader to recording provider, editor=%s",
  async (editor) => {
    const h = await fixture({ editor });
    const system = await h.prompt();
    expect(system).toContain(
      editor ? "TEMPLATE CORE" : "You are an expert coding assistant",
    );
    expect(system).toContain(
      `<global_instructions path="${join(h.agentDir, "AGENTS.md")}">\nGLOBAL OPAQUE\n\n</global_instructions>`,
    );
    expect(system).toContain(
      `<workspace_instructions path="${join(h.parent, "AGENTS.md")}" directory="${h.parent}">`,
    );
    expect(system.indexOf("PARENT OPAQUE")).toBeLessThan(
      system.indexOf("NESTED OPAQUE"),
    );
    expect(system).not.toContain(
      "Project-specific instructions and guidelines:",
    );
  },
);

test("custom core bypass retains scoped instructions through provider", async () => {
  const h = await fixture({ customPrompt: "CUSTOM CORE" });
  const system = await h.prompt();
  expect(system).toMatch(/^CUSTOM CORE/);
  expect(system).not.toContain("TEMPLATE CORE");
  expect(system).toContain("<global_instructions ");
  expect(system).toContain("<workspace_instructions ");
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
  expect(system).toContain(globalContent);
  expect(system).toContain(appended);
  expect(system).toContain("<name>probe</name>");
  expect(system.split("<name>probe</name>")).toHaveLength(2);
  expect(system.indexOf("GLOBAL OPAQUE")).toBeLessThan(
    system.indexOf("MIDDLE"),
  );
  expect(system.indexOf("PARENT OPAQUE")).toBeGreaterThan(
    system.indexOf("MIDDLE"),
  );
  expect(system.indexOf("NESTED OPAQUE")).toBeLessThan(system.indexOf("LATE"));
  for (const text of [
    "GLOBAL OPAQUE",
    "PARENT OPAQUE",
    "NESTED OPAQUE",
    "APPENDED EXACT",
    "PRIOR ADDITION",
    "LATER ADDITION",
  ])
    expect(system.split(text)).toHaveLength(2);
});

test.each(["GLOBAL", "WORKSPACE"])(
  "omitted %s slot retains that scoped block in the tail",
  async (scope) => {
    const h = await fixture({
      template: `CORE\n{{${scope === "GLOBAL" ? "WORKSPACE" : "GLOBAL"}_INSTRUCTIONS}}\nEND`,
    });
    const system = await h.prompt();
    const omitted = scope === "GLOBAL" ? "GLOBAL OPAQUE" : "PARENT OPAQUE";
    expect(system.indexOf(omitted)).toBeGreaterThan(system.indexOf("END"));
    for (const text of ["GLOBAL OPAQUE", "PARENT OPAQUE", "NESTED OPAQUE"])
      expect(system.split(text)).toHaveLength(2);
  },
);

test("repeated instruction slot fails open without duplicate loaded content", async () => {
  const h = await fixture({
    template: "BAD\n{{GLOBAL_INSTRUCTIONS}}\n{{GLOBAL_INSTRUCTIONS}}",
  });
  const system = await h.prompt();
  expect(system).toMatch(/^You are an expert coding assistant/);
  expect(system).not.toContain("BAD");
  expect(system.split("GLOBAL OPAQUE")).toHaveLength(2);
});
