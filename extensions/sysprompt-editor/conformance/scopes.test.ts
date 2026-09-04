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
}: { customPrompt?: string; template?: string; editor?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sysprompt-real-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const agentDir = join(root, "agent");
  const parent = join(root, "workspace");
  const cwd = join(parent, "nested");
  const templatesDir = join(root, "templates");
  const artifactsDir = join(root, "artifacts");
  for (const dir of [agentDir, cwd, templatesDir])
    mkdirSync(dir, { recursive: true });
  writeFileSync(join(agentDir, "AGENTS.md"), "GLOBAL OPAQUE\n");
  writeFileSync(join(parent, "AGENTS.md"), "PARENT OPAQUE\n");
  writeFileSync(join(cwd, "AGENTS.md"), "NESTED OPAQUE\n");
  writeFileSync(
    join(templatesDir, "default.md"),
    template ??
      "TEMPLATE CORE\n{{AVAILABLE_TOOLS}}\n{{GUIDELINES}}\n{{PI_DOCS}}\n{{SKILLS}}\n",
  );
  const settingsManager = SettingsManager.inMemory();
  settingsManager.setProjectTrusted(true);
  const payloads: unknown[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    systemPrompt: customPrompt,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    extensionFactories: [
      ...(editor
        ? [(pi) => systemPromptExtension(pi, { templatesDir, artifactsDir })]
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
