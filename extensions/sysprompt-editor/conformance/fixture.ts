/**
 * A real Pi pipeline from the published package: DefaultResourceLoader
 * discovers instruction files and skills from temp directories, an
 * AgentSession runs the extension chain, and a faux provider records the
 * payload at its serialization boundary. No network, no Pi checkout.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  SessionManager,
  createAgentSession,
  type ExtensionAPI,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  registerFauxProvider,
  streamSimple,
} from "@earendil-works/pi-ai/compat";
import systemPromptExtension from "../index.ts";

const cleanups: (() => void)[] = [];
after(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

export const kitRoot = new URL("../../../", import.meta.url);

export async function fixture({
  customPrompt,
  template,
  editor = true,
  globalContent = "GLOBAL OPAQUE\n",
  appendSystemPrompt,
  additions = false,
  reuse,
  sessionManager,
  driftCore = false,
  insertCore = false,
  customFile,
  beforeStart,
  notify,
  uiContext,
  piVersion,
}: {
  customPrompt?: string;
  template?: string;
  editor?: boolean;
  globalContent?: string;
  appendSystemPrompt?: string;
  additions?: boolean;
  reuse?: { root: string };
  sessionManager?: SessionManager;
  driftCore?: boolean;
  insertCore?: boolean;
  customFile?: "global" | "workspace";
  beforeStart?: () => Promise<void>;
  notify?: (message: string) => void;
  uiContext?: ExtensionUIContext;
  piVersion?: string;
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
  // The extension asks Pi for its agent directory the way the CLI does.
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const settingsManager = SettingsManager.inMemory();
  settingsManager.setProjectTrusted(true);
  const payloads: unknown[] = [];
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
    noPromptTemplates: true,
    extensionFactories: [
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
              systemPromptExtension(pi, {
                templatesDir,
                artifactsDir,
                piVersion,
              }),
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
        pi.on("before_provider_request", (event) => {
          payloads.push(structuredClone(event.payload));
        });
      },
    ],
  });
  await resourceLoader.reload();
  if (resourceLoader.getExtensions().errors.length > 0)
    throw new Error(JSON.stringify(resourceLoader.getExtensions().errors));

  const faux = registerFauxProvider({
    models: [{ id: "recording-one" }, { id: "recording-two" }],
  });
  cleanups.push(faux.unregister);
  faux.setResponses(
    Array.from({ length: 32 }, () => fauxAssistantMessage("recorded")),
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: join(root, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
  });
  modelRuntime.registerProvider(faux.models[0].provider, {
    baseUrl: faux.models[0].baseUrl,
    apiKey: "faux-key",
    api: faux.api,
    models: faux.models.map((model) => ({
      id: model.id,
      name: model.name,
      api: model.api,
      reasoning: model.reasoning,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      baseUrl: model.baseUrl,
    })),
  });
  const models = faux.models;
  const manager =
    sessionManager ?? SessionManager.create(cwd, join(root, "sessions"));
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    sessionManager: manager,
    modelRuntime,
    model: models[0],
  });
  cleanups.push(() => session.dispose());
  await session.bindExtensions(
    uiContext
      ? { uiContext, mode: "tui" }
      : notify
        ? { uiContext: { notify } as never }
        : {},
  );
  const finalPayloads: unknown[] = [];
  session.agent.streamFunction = async (model, context, options) => {
    // A recording provider's serialization boundary, with no network transport.
    const payload = {
      system: context.systemPrompt,
      messages: context.messages,
    };
    finalPayloads.push((await options?.onPayload?.(payload, model)) ?? payload);
    return streamSimple(model, context, options);
  };
  async function prompt() {
    await session.prompt("probe");
    if (payloads.length === 0) throw new Error("no payload observed");
    const payload = finalPayloads.at(-1) as { system: string };
    return payload.system;
  }
  return {
    session,
    sessionManager: manager,
    models,
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
    faux,
    prompt,
  };
}

/** Capture stderr writes for the duration of `run`. */
export async function capturingStderr<T>(
  run: () => Promise<T>,
): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    return { result: await run(), lines };
  } finally {
    process.stderr.write = original;
  }
}
