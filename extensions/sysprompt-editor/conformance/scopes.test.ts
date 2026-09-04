import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createHarness } from "@pi-source/packages/coding-agent/test/suite/harness.ts";
import { createFauxStreamFn } from "@pi-source/packages/coding-agent/test/test-harness.ts";
import systemPromptExtension from "../index.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

export async function fixture({
  customPrompt,
  template,
  editor = true,
  globalContent = "GLOBAL OPAQUE\n",
  appendSystemPrompt,
  additions = false,
}: {
  customPrompt?: string;
  template?: string;
  editor?: boolean;
  globalContent?: string;
  appendSystemPrompt?: string;
  additions?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "sysprompt-real-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const agentDir = join(root, "agent");
  const parent = join(root, "workspace");
  const cwd = join(parent, "nested");
  const templatesDir = join(root, "templates");
  const artifactsDir = join(root, "artifacts");
  for (const dir of [agentDir, cwd, templatesDir])
    mkdirSync(dir, { recursive: true });
  writeFileSync(join(agentDir, "AGENTS.md"), globalContent);
  writeFileSync(join(parent, "AGENTS.md"), "PARENT OPAQUE\n");
  writeFileSync(join(cwd, "AGENTS.md"), "NESTED OPAQUE\n");
  writeFileSync(
    join(templatesDir, "default.md"),
    template ??
      "TEMPLATE CORE\n{{AVAILABLE_TOOLS}}\n{{GUIDELINES}}\n{{PI_DOCS}}\n{{SKILLS}}\n",
  );
  const skillDir = join(agentDir, "skills", "probe");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "---\nname: probe\ndescription: SKILL DESCRIPTION\n---\nSkill body.\n",
  );
  const settingsManager = SettingsManager.inMemory();
  settingsManager.setProjectTrusted(true);
  const payloads: unknown[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    systemPrompt: customPrompt,
    appendSystemPrompt: appendSystemPrompt ? [appendSystemPrompt] : [],
    noExtensions: true,
    noSkills: false,
    noThemes: true,
    noPromptTemplates: true,
    extensionFactories: [
      ...(additions
        ? [
            (pi) => {
              pi.on("before_agent_start", (event) => ({
                systemPrompt: event.systemPrompt + "\nPRIOR ADDITION",
              }));
            },
          ]
        : []),
      ...(editor
        ? [(pi) => systemPromptExtension(pi, { templatesDir, artifactsDir })]
        : []),
      ...(additions
        ? [
            (pi) => {
              pi.on("before_agent_start", (event) => ({
                systemPrompt: event.systemPrompt + "\nLATER ADDITION",
              }));
            },
          ]
        : []),
      (pi) => {
        pi.on("before_provider_request", (event) => {
          payloads.push(structuredClone(event.payload));
        });
      },
    ],
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const h = await createHarness({
    resourceLoader,
    models: [{ id: "recording-one" }, { id: "recording-two" }],
  });
  cleanups.push(h.cleanup);
  await h.session.bindExtensions({});
  const { streamFn } = createFauxStreamFn(["recorded"]);
  h.session.agent.streamFunction = async (model, context, options) => {
    // A recording provider's serialization boundary, with no network transport.
    await options?.onPayload?.(
      { system: context.systemPrompt, messages: context.messages },
      model,
    );
    return streamFn(model, context, options);
  };
  async function prompt() {
    await h.session.prompt("probe");
    expect(payloads.length).toBeGreaterThan(0);
    const payload = payloads.at(-1) as { system: string };
    return payload.system;
  }
  return {
    ...h,
    root,
    agentDir,
    cwd,
    parent,
    templatesDir,
    artifactsDir,
    payloads,
    resourceLoader,
    prompt,
  };
}

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
