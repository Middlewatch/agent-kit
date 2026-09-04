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
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createHarness } from "@pi-source/packages/coding-agent/test/suite/harness";
import { createFauxStreamFn } from "@pi-source/packages/coding-agent/test/test-harness";
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
  eraseScope = false,
  driftCore = false,
  insertCore = false,
  transformPayload = false,
  customFile,
  beforeStart,
}: {
  customPrompt?: string;
  template?: string;
  editor?: boolean;
  globalContent?: string;
  appendSystemPrompt?: string;
  additions?: boolean;
  reuse?: { root: string };
  sessionManager?: SessionManager;
  eraseScope?: boolean;
  driftCore?: boolean;
  insertCore?: boolean;
  transformPayload?: boolean;
  customFile?: "global" | "workspace";
  beforeStart?: () => Promise<void>;
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
  if (customFile) {
    const dir = customFile === "global" ? agentDir : join(cwd, ".pi");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SYSTEM.md"), "FILE CORE");
  }
  const settingsManager = SettingsManager.inMemory();
  settingsManager.setProjectTrusted(true);
  const payloads: unknown[] = [];
  const finalPayloads: unknown[] = [];
  const incoming: string[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    systemPrompt: customPrompt,
    appendSystemPrompt: appendSystemPrompt ? [appendSystemPrompt] : [],
    noExtensions: true,
    noSkills: false,
    noThemes: true,
    agentsFilesOverride: eraseScope
      ? (base) => ({
          agentsFiles: base.agentsFiles.map(({ path, content }) => ({
            path,
            content,
          })),
        })
      : undefined,
    noPromptTemplates: true,
    extensionFactories: [
      (pi: ExtensionAPI) => {
        if (transformPayload)
          pi.on("provider_request", (event) => {
            (event.payload as { system: string }).system = "OBSERVER MUTATION";
            event.model.id = "OBSERVER MODEL MUTATION";
          });
      },
      (pi: ExtensionAPI) => {
        pi.on("before_agent_start", async (event) => {
          await beforeStart?.();
          if (insertCore)
            return {
              systemPrompt: event.systemPrompt.replace(
                "\n\nAvailable tools:",
                "\n\nCRITICAL PRIOR POLICY\n\nAvailable tools:",
              ),
            };
        });
      },
      (pi: ExtensionAPI) => {
        pi.on("before_agent_start", (event) =>
          driftCore
            ? {
                systemPrompt: event.systemPrompt.replace(
                  "Guidelines:",
                  "Changed guidelines:",
                ),
              }
            : undefined,
        );
      },
      ...(additions
        ? [
            (pi: ExtensionAPI) => {
              pi.on("before_agent_start", (event) => ({
                systemPrompt: event.systemPrompt + "\nPRIOR ADDITION",
              }));
            },
          ]
        : []),
      (pi: ExtensionAPI) => {
        pi.on("before_agent_start", (event) => {
          incoming.push(event.systemPrompt);
        });
      },
      ...(editor
        ? [
            (pi: ExtensionAPI) =>
              systemPromptExtension(pi, { templatesDir, artifactsDir }),
          ]
        : []),
      ...(additions
        ? [
            (pi: ExtensionAPI) => {
              pi.on("before_agent_start", (event) => ({
                systemPrompt: event.systemPrompt + "\nLATER ADDITION",
              }));
            },
          ]
        : []),
      (pi: ExtensionAPI) => {
        if (transformPayload)
          pi.on("before_provider_request", (event) => ({
            ...(event.payload as object),
            system: "ACTUAL FINAL",
          }));
      },
      (pi: ExtensionAPI) => {
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
    const payload = {
      system: context.systemPrompt,
      messages: context.messages,
    };
    finalPayloads.push((await options?.onPayload?.(payload, model)) ?? payload);
    return streamFn(model, context, options);
  };
  async function prompt() {
    await session.prompt("probe");
    expect(payloads.length).toBeGreaterThan(0);
    const payload = finalPayloads.at(-1) as { system: string };
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
    finalPayloads,
    incoming,
    resourceLoader,
    prompt,
  };
}
