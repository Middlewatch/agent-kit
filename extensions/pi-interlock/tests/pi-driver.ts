import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionUIContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

interface DriverRequest {
  agentDir: string;
  cwd: string;
  effectPath: string;
  entry: string;
  input: Record<string, unknown>;
  toolName: string;
  command?: string;
  uiResponse?: "yes" | "no" | "timeout" | "noUi";
  throwStatus?: boolean;
}

interface ConfirmationRecord {
  title: string;
  message: string;
}

interface StatusRecord {
  key: string;
  text?: string;
}

interface NotificationRecord {
  message: string;
  level?: string;
}

function uiStub(
  response: "yes" | "no" | "timeout",
  confirmations: ConfirmationRecord[],
  statuses: StatusRecord[],
  notifications: NotificationRecord[],
  throwStatus: boolean,
): ExtensionUIContext {
  const confirm: ExtensionUIContext["confirm"] = async (title, message) => {
    confirmations.push({ title, message });
    if (response === "timeout") return await new Promise<boolean>(() => {});
    return response === "yes";
  };
  const setStatus: ExtensionUIContext["setStatus"] = (key, text) => {
    statuses.push(text === undefined ? { key } : { key, text });
    if (throwStatus) throw new Error("status sink failed");
  };
  const notify: ExtensionUIContext["notify"] = (message, level) => {
    notifications.push(level === undefined ? { message } : { message, level });
  };
  return new Proxy({ confirm, setStatus, notify } as ExtensionUIContext, {
    get(target, property, receiver) {
      if (Reflect.has(target, property))
        return Reflect.get(target, property, receiver) as unknown;
      if (property === "theme") return {};
      return () => undefined;
    },
  });
}

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

async function main(): Promise<void> {
  const request = JSON.parse(readFileSync(0, "utf8")) as DriverRequest;
  const cwd = resolve(request.cwd);
  const agentDir = resolve(request.agentDir);
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [resolve(request.entry)],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  if (loaded.errors.length > 0 || loaded.extensions.length !== 1) {
    process.stdout.write(
      `${JSON.stringify({ errors: loaded.errors, extensionCount: loaded.extensions.length })}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const parameters = {
    "~kind": "Object",
    type: "object",
    properties: {},
    additionalProperties: true,
  } as ToolDefinition["parameters"];
  const syntheticTool: ToolDefinition = {
    name: request.toolName,
    label: "Interlock fixture tool",
    description: "Executes only the isolated Interlock side-effect oracle.",
    parameters,
    async execute() {
      mkdirSync(dirname(request.effectPath), { recursive: true });
      appendFileSync(request.effectPath, "executed\n", { flag: "a" });
      return {
        content: [{ type: "text", text: "fixture tool completed" }],
        details: {},
      };
    },
  };
  const model = {
    id: "interlock-fixture",
    name: "Interlock fixture",
    api: "openai-completions" as const,
    provider: "interlock-fixture",
    baseUrl: "http://127.0.0.1.invalid",
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 128,
  };
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    model,
    noTools: "builtin",
    customTools: [syntheticTool],
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  const confirmations: ConfirmationRecord[] = [];
  const statuses: StatusRecord[] = [];
  const notifications: NotificationRecord[] = [];
  if (request.uiResponse !== undefined && request.uiResponse !== "noUi") {
    await session.bindExtensions({
      uiContext: uiStub(
        request.uiResponse,
        confirmations,
        statuses,
        notifications,
        request.throwStatus ?? false,
      ),
      mode: "tui",
    });
  }
  if (request.command !== undefined) await session.prompt(request.command);

  let streamIndex = 0;
  session.agent.streamFunction = async () => {
    const toolTurn = streamIndex++ === 0;
    const message = {
      role: "assistant",
      content: toolTurn
        ? [
            {
              type: "toolCall",
              id: "interlock-conformance-1",
              name: request.toolName,
              arguments: request.input,
            },
          ]
        : [{ type: "text", text: "fixture complete" }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: toolTurn ? "toolUse" : "stop",
      timestamp: Date.now(),
    };
    const response = {
      async *[Symbol.asyncIterator]() {
        yield { type: "done", reason: message.stopReason, message };
      },
      async result() {
        return message;
      },
    };
    return response as unknown as Awaited<
      ReturnType<typeof session.agent.streamFunction>
    >;
  };

  let toolStarts = 0;
  let toolEnds = 0;
  const unsubscribe = session.agent.subscribe((event) => {
    if (event.type === "tool_execution_start") toolStarts += 1;
    if (event.type === "tool_execution_end") toolEnds += 1;
  });
  try {
    await session.agent.prompt("run the isolated fixture tool once");
    const toolResult = session.messages.find(
      (message) => message.role === "toolResult",
    );
    const reason =
      toolResult?.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n") ?? "";
    const configPath = join(agentDir, "interlock.json");
    const persistedMode = existsSync(configPath)
      ? (JSON.parse(readFileSync(configPath, "utf8")) as { mode?: unknown })
          .mode
      : undefined;
    process.stdout.write(
      `${JSON.stringify({
        block: toolResult?.isError === true,
        reason,
        toolStarts,
        toolEnds,
        confirmations,
        statuses,
        notifications,
        persistedMode,
      })}\n`,
    );
  } finally {
    unsubscribe();
    session.dispose();
  }
}

await main();
