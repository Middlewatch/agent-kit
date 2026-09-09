import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { fixture, kitRoot } from "./fixture.ts";

const builtinDefinitions = [
  createBashToolDefinition,
  createReadToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  createGrepToolDefinition,
  createFindToolDefinition,
  createLsToolDefinition,
];

function once(text: string, value: string): void {
  assert.equal(text.split(value).length - 1, 1, value);
}

for (const name of [
  "owner.md",
  "default.md",
  "starter.md",
  "claude-example.md",
  "openai-example.md",
]) {
  test(`${name}: real gutter overrides retain every builtin prompt contribution`, async () => {
    const template = readFileSync(
      new URL(`guidance/sysprompt/${name}`, kitRoot),
      "utf8",
    );
    const h = await fixture({
      template,
      extensionPaths: [
        fileURLToPath(new URL("extensions/pi-tui/src/index.ts", kitRoot)),
      ],
    });
    const system = await h.prompt();
    assert.notEqual(system, h.incoming.at(-1), "template must render");
    const payload = h.finalPayloads.at(-1) as {
      tools: { name: string; description: string; parameters: unknown }[];
    };
    for (const create of builtinDefinitions) {
      const definition = create(h.cwd);
      const summary = `- ${definition.name}: ${definition.promptSnippet}`;
      once(h.incoming.at(-1)!, summary);
      once(system, summary);
      for (const guideline of definition.promptGuidelines ?? [])
        once(system, `- ${guideline}`);
      const tool = payload.tools.find((tool) => tool.name === definition.name);
      assert.equal(tool?.description, definition.description);
      assert.deepEqual(tool?.parameters, definition.parameters);
    }
  });
}

function registerProbe(pi: ExtensionAPI, name: string, snippet = true): void {
  pi.registerTool({
    name,
    label: name,
    description: `${name} full tool description`,
    promptSnippet: snippet ? `${name} summary` : undefined,
    promptGuidelines: [`Use ${name} for its probe.`, " Shared guideline "],
    parameters: { type: "object", properties: {} },
    async execute() {
      return { content: [{ type: "text", text: "probe" }], details: {} };
    },
  });
}

for (const hasUI of [false, true]) {
  test(`session_start availability reaches the first prompt with hasUI=${hasUI}`, async () => {
    const h = await fixture({
      notify: hasUI ? () => {} : undefined,
      afterEditor: [
        (pi) => {
          registerProbe(pi, "ui_tool");
          const reconcile = (_event: unknown, ctx: ExtensionContext) => {
            const active = pi.getActiveTools();
            if (!ctx.hasUI && active.includes("ui_tool"))
              pi.setActiveTools(active.filter((name) => name !== "ui_tool"));
            else if (ctx.hasUI && !active.includes("ui_tool"))
              pi.setActiveTools([...active, "ui_tool"]);
          };
          pi.on("session_start", reconcile);
          pi.on("before_agent_start", reconcile);
        },
      ],
    });
    const system = await h.prompt();
    assert.equal(system.includes("- ui_tool: ui_tool summary"), hasUI);
    assert.equal(system.includes("- Use ui_tool for its probe."), hasUI);
    const payload = h.finalPayloads.at(-1) as { tools: { name: string }[] };
    assert.equal(
      payload.tools.some((tool) => tool.name === "ui_tool"),
      hasUI,
    );
  });
}

test("Pi gathers tool instructions regardless of editor load order and filters inactive tools", async () => {
  let api: ExtensionAPI;
  const h = await fixture({
    beforeEditor: [(pi) => registerProbe(pi, "early")],
    afterEditor: [
      (pi) => {
        api = pi;
        registerProbe(pi, "late");
        registerProbe(pi, "schema_only", false);
      },
    ],
  });
  const system = await h.prompt();
  for (const name of ["early", "late"])
    once(system, `- ${name}: ${name} summary`);
  for (const name of ["early", "late", "schema_only"])
    once(system, `- Use ${name} for its probe.`);
  once(system, "- Shared guideline");
  assert.ok(!system.includes("- schema_only:"));
  assert.ok(!system.includes("schema_only full tool description"));
  const payload = h.finalPayloads.at(-1) as {
    tools: { name: string; description: string }[];
  };
  assert.equal(
    payload.tools.find((tool) => tool.name === "schema_only")?.description,
    "schema_only full tool description",
  );

  api!.setActiveTools(["bash", "early"]);
  const reduced = await h.prompt();
  once(reduced, "- early: early summary");
  assert.ok(!reduced.includes("late summary"));
  assert.ok(!reduced.includes("Use late"));
  assert.ok(!reduced.includes("Use schema_only"));
  assert.ok(reduced.includes("Use bash to load a skill's file"));

  registerProbe(api!, "dynamic");
  api!.setActiveTools(["read", "dynamic"]);
  const changed = await h.prompt();
  once(changed, "- dynamic: dynamic summary");
  once(changed, "- Use dynamic for its probe.");
  assert.ok(!changed.includes("early summary"));
  assert.ok(changed.includes("Use the read tool to load a skill's file"));
});
