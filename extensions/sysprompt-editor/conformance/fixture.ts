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
  SessionManager,
  createAgentSession,
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
  reuse,
  sessionManager,
}: {
  customPrompt?: string;
  template?: string;
  editor?: boolean;
  globalContent?: string;
  appendSystemPrompt?: string;
  additions?: boolean;
  reuse?: { root: string };
  sessionManager?: SessionManager;
} = {}) {
  const root = reuse?.root ?? mkdtempSync(join(tmpdir(), "sysprompt-real-"));
  if (!reuse)
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const agentDir = join(root, "agent");
  const parent = join(root, "workspace");
  const cwd = join(parent, "nested");
  const templatesDir = join(root, "templates");
  const artifactsDir = join(root, "artifacts");
  for (const dir of [agentDir, cwd, templatesDir])
    mkdirSync(dir, { recursive: true });
  if (!reuse) {
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
  }
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
  const manager =
    sessionManager ?? SessionManager.create(cwd, join(root, "sessions"));
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    sessionManager: manager,
    modelRuntime: h.session.modelRuntime,
    model: h.models[0],
  });
  cleanups.push(() => session.dispose());
  await session.bindExtensions({});
  const { streamFn } = createFauxStreamFn(["recorded"]);
  session.agent.streamFunction = async (model, context, options) => {
    // A recording provider's serialization boundary, with no network transport.
    await options?.onPayload?.(
      { system: context.systemPrompt, messages: context.messages },
      model,
    );
    return streamFn(model, context, options);
  };
  async function prompt() {
    await session.prompt("probe");
    expect(payloads.length).toBeGreaterThan(0);
    const payload = payloads.at(-1) as { system: string };
    return payload.system;
  }
  return {
    ...h,
    session,
    sessionManager: manager,
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
