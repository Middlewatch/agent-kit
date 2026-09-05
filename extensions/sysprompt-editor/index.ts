/** Session-local template selection and prompt/inspection event wiring. */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createCaptureState,
  awaitWireRecord,
  extractSystemPromptFromPayload,
  freeBase,
  listDir,
  makeStamp,
  modelLabel,
  renderImmediateDump,
  renderProviderDump,
  renderWireDump,
} from "./lib/inspect.ts";
import {
  assistantText,
  buildTestMessage,
  formatResult,
  resultBase,
} from "./lib/output-test.ts";
import {
  evidenceLines,
  instructionInventory,
  sha256,
  type PromptEvidence,
} from "./lib/evidence.ts";
import { coreSource, onFinalPayload } from "./lib/pi-contract.ts";
import { splitTail, splicePrompt } from "./lib/splice.ts";
import {
  PINNED_PI_VERSION,
  STOCK_FIRST_LINE,
  scopeFiles,
  stockCore,
  type DocPaths,
} from "./lib/stock-core.ts";
import {
  listTemplates,
  readTemplate,
  scaffoldTemplate,
} from "./lib/templates.ts";

import {
  initializeSelection,
  restoreSelection,
  saveSelection,
  type Selection,
} from "./lib/selection.ts";

const ACTIONS = ["switch", "new", "inspect", "test"] as const;
type Action = (typeof ACTIONS)[number];
const USAGE = "usage: /sysprompt [switch|new|inspect|test]";

/**
 * Filesystem locations the extension works against. Pi calls the default
 * export with no paths and the URL-resolved defaults apply; tests pass temp
 * directories. This is the only injection mechanism. `agentDir` and
 * `docPaths` default to the running Pi's own answers, read lazily so unit
 * tests never load the Pi package.
 */
export interface ExtensionPaths {
  templatesDir?: string;
  artifactsDir?: string;
  fixturePath?: string;
  agentDir?: string;
  docPaths?: DocPaths;
}

interface PiFacts {
  agentDir: string;
  docPaths: DocPaths;
  version: string;
}

function resolvePath(spelling: string): string | null {
  try {
    return fileURLToPath(new URL(spelling, import.meta.url));
  } catch {
    return null;
  }
}

export default function systemPromptExtension(
  pi: ExtensionAPI,
  paths: ExtensionPaths = {},
): void {
  // Templates are guidance, not code: they live beside the global guide in
  // the kit's guidance/ tree. Artifacts stay inside this extension's
  // directory (gitignored).
  const templatesDir =
    paths.templatesDir ?? resolvePath("../../guidance/sysprompt/");
  const artifactsDir = paths.artifactsDir ?? resolvePath("./artifacts/");
  const fixturePath =
    paths.fixturePath ?? resolvePath("./fixtures/output-test-document.md");

  let facts: Promise<PiFacts> | null = null;
  function piFacts(): Promise<PiFacts> {
    facts ??= (async () => {
      if (paths.agentDir !== undefined && paths.docPaths !== undefined)
        return {
          agentDir: paths.agentDir,
          docPaths: paths.docPaths,
          version: PINNED_PI_VERSION,
        };
      const pi = await import("@earendil-works/pi-coding-agent");
      return {
        agentDir: paths.agentDir ?? pi.getAgentDir(),
        docPaths: paths.docPaths ?? {
          readme: pi.getReadmePath(),
          docs: pi.getDocsPath(),
          examples: pi.getExamplesPath(),
        },
        version: pi.VERSION,
      };
    })();
    return facts;
  }

  let lastEvidence: PromptEvidence | null = null;
  const { armCapture, takeArmedCapture } = createCaptureState();

  // Output test awaiting its turn_end.
  let pendingTest: {
    stamp: string;
    provider: string;
    modelId: string;
  } | null = null;

  let lastWarning: string | null = null;
  function warn(ctx: ExtensionContext, reason: string): void {
    if (lastEvidence) {
      const pin = selection(ctx);
      lastEvidence.selectedName = pin.kind === "selected" ? pin.name : null;
      lastEvidence.reason = reason;
    }
    const key = `${ctx.sessionManager.getSessionId()}:${reason}`;
    if (lastWarning === key) return;
    lastWarning = key;
    const message = `sysprompt: ${reason}; incoming prompt preserved`;
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
    else process.stderr.write(`${message}\n`);
  }
  function selection(ctx: ExtensionContext): Selection {
    return restoreSelection(ctx.sessionManager.getBranch());
  }
  function activeTemplate(
    ctx: ExtensionContext,
  ): { name: string; content: string } | { reason: string } {
    if (templatesDir === null)
      return { reason: "templates directory could not be resolved" };
    const pin = initializeSelection(
      selection(ctx),
      templatesDir,
      (type, data) => pi.appendEntry(type, data),
    );
    if (pin.kind === "invalid") return { reason: pin.reason };
    try {
      return readTemplate(templatesDir, pin.name);
    } catch (error) {
      return {
        reason: `selected template ${pin.name} unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    const pin = selection(ctx);
    const options = event.systemPromptOptions ?? { cwd: "" };
    const { agentDir, docPaths, version } = await piFacts();
    const files = scopeFiles(options.contextFiles ?? [], agentDir);
    lastEvidence = {
      coreSource: coreSource(options),
      selectedName: pin.kind === "selected" ? pin.name : null,
      renderedName: null,
      templateSha256: null,
      reason: null,
      instructions: instructionInventory(files),
    };
    const prompt: string = event.systemPrompt ?? "";
    if (options.customPrompt) {
      lastEvidence.reason = "custom system prompt bypass";
      lastWarning = null;
      return;
    }
    if (!prompt.startsWith(STOCK_FIRST_LINE)) {
      warn(ctx, "stock core boundary not recognized");
      return;
    }
    // Stock Pi hands over the prompt as earlier extensions left it. The
    // core is trusted only when it matches Pi's own construction from the
    // same inputs; anything else (an insertion, or a Pi release that
    // changed the prose) fails open.
    const core = splitTail(prompt, options.appendSystemPrompt)[0];
    if (core !== stockCore(options, docPaths)) {
      warn(
        ctx,
        `stock core differs from Pi ${PINNED_PI_VERSION} as mirrored (running ${version}); core was modified or the mirror needs re-pinning`,
      );
      return;
    }
    const active = activeTemplate(ctx);
    if ("reason" in active) {
      warn(ctx, active.reason);
      return;
    }

    lastEvidence.selectedName = active.name;
    lastEvidence.templateSha256 = sha256(active.content);
    const result = splicePrompt(
      active.content,
      prompt,
      { appendSystemPrompt: options.appendSystemPrompt, contextFiles: files },
      process.env.PI_SCRATCHPAD,
    );
    if ("reason" in result) {
      warn(ctx, result.reason);
      return;
    }
    lastWarning = null;
    lastEvidence.renderedName = active.name;
    return { systemPrompt: result.prompt };
  });

  async function actionSwitch(
    ctx: ExtensionCommandContext,
    requested?: string,
  ): Promise<void> {
    if (templatesDir === null) {
      ctx.ui.notify("templates directory could not be resolved", "error");
      return;
    }
    const pin = selection(ctx);
    const names = listTemplates(
      templatesDir,
      pin.kind === "selected" ? pin.name : undefined,
    );
    if (names.length === 0) {
      ctx.ui.notify("no templates found", "warning");
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId();
    const leaf = ctx.sessionManager.getLeafId();
    const chosen =
      requested ?? (await ctx.ui.select("Active template:", names));
    if (chosen === undefined) return;
    try {
      if (
        ctx.sessionManager.getSessionId() !== sessionId ||
        ctx.sessionManager.getLeafId() !== leaf
      )
        throw new Error(
          "session branch changed while choosing a template; try again",
        );
      readTemplate(templatesDir, chosen);
      saveSelection(chosen, (type, data) => pi.appendEntry(type, data));
    } catch (error) {
      const message = `template selection not changed: ${error instanceof Error ? error.message : String(error)}`;
      if (ctx.hasUI) ctx.ui.notify(message, "error");
      else process.stderr.write(`${message}\n`);
      return;
    }
    const message = `session template: ${chosen} (applies next message)`;
    if (ctx.hasUI) ctx.ui.notify(message);
    else process.stderr.write(`${message}\n`);
  }

  async function actionNew(ctx: ExtensionCommandContext): Promise<void> {
    if (templatesDir === null) {
      ctx.ui.notify("templates directory could not be resolved", "error");
      return;
    }
    const name = await ctx.ui.input("Template name:");
    if (name === undefined) return; // cancelled: no write
    const active = activeTemplate(ctx);
    if ("reason" in active) {
      ctx.ui.notify("no active template to copy", "warning");
      return;
    }
    const created = scaffoldTemplate(templatesDir, name, active.content);
    if (created instanceof Error) {
      ctx.ui.notify(created.message, "error");
      return;
    }
    ctx.ui.notify(`created ${created} (copy of ${active.name})`);
  }

  /** mkdir -p then write; returns the error message on failure. */
  function writeArtifact(file: string, content: string): string | null {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, "utf8");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  onFinalPayload(pi, async (event, ctx) => {
    const system = extractSystemPromptFromPayload(event.payload);
    if (lastEvidence && system !== null)
      lastEvidence.providerSystemSha256 = sha256(system);
    if (pendingTest) {
      const seen = modelLabel(event.model);
      pendingTest.provider = seen.provider;
      pendingTest.modelId = seen.modelId;
    }
    const stamp = takeArmedCapture() ?? pendingTest?.stamp ?? null;
    if (stamp === null) return;
    if (artifactsDir === null) {
      ctx.ui.notify("artifacts directory could not be resolved", "error");
      return;
    }
    const inspectDir = path.join(artifactsDir, "inspect");
    const { provider, modelId } = modelLabel(event.model);
    // Wire pickup: the capture dir is snapshotted before the request leaves
    // so the record that appears after it is this turn's. Not awaited here;
    // pi holds the request until this handler returns.
    const captureDir = process.env.CLAUDE_GO_CAPTURE_DIR;
    if (provider === "claude-go" && captureDir) {
      const before = listDir(captureDir);
      const needle = extractSystemPromptFromPayload(event.payload);
      void awaitWireRecord(captureDir, before, needle).then((hit) => {
        if (hit === null) {
          ctx.ui.notify(
            `inspect ${stamp}: no wire record appeared in ${captureDir}`,
            "warning",
          );
          return;
        }
        const wire = renderWireDump(
          { timestamp: stamp, provider, modelId },
          hit.file,
          hit.record,
          hit.system,
        );
        const wireBase = path.join(
          inspectDir,
          freeBase(inspectDir, `${stamp}-wire`, [".md", ".txt"]),
        );
        const failure =
          writeArtifact(`${wireBase}.md`, wire.md) ??
          (wire.txt === null
            ? null
            : writeArtifact(`${wireBase}.txt`, wire.txt));
        if (failure !== null) {
          ctx.ui.notify(failure, "error");
          return;
        }
        ctx.ui.notify(`wrote ${wireBase}.md from ${hit.file}`);
      });
    }
    let dump: { md: string; txt: string | null };
    try {
      dump = renderProviderDump(
        { timestamp: stamp, provider, modelId },
        event.payload,
        lastEvidence,
      );
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
      return;
    }
    const base = path.join(
      inspectDir,
      freeBase(inspectDir, `${stamp}-provider`, [".md", ".txt"]),
    );
    const mdFailure = writeArtifact(`${base}.md`, dump.md);
    if (mdFailure !== null) {
      ctx.ui.notify(mdFailure, "error");
      return;
    }
    if (dump.txt === null) {
      ctx.ui.notify(
        `wrote ${base}.md (payload shape unrecognized; no .txt written)`,
        "warning",
      );
      return;
    }
    const txtFailure = writeArtifact(`${base}.txt`, dump.txt);
    if (txtFailure !== null) {
      ctx.ui.notify(txtFailure, "error");
      return;
    }
    const sha = createHash("sha256").update(dump.txt, "utf8").digest("hex");
    ctx.ui.notify(
      `wrote ${base}.md and ${base}.txt sha256:${sha.slice(0, 12)}`,
    );
  });

  pi.on("turn_end", async (event: any, ctx: any) => {
    // Fail-safe for providers that never emit before_provider_request: a
    // capture still armed when the turn ends can never fire for the message
    // that was meant to trigger it, so disarm rather than let it attach to
    // a later, unrelated turn.
    const stale = takeArmedCapture();
    if (stale !== null) {
      ctx.ui.notify(
        `inspect ${stale}: provider did not expose its payload (custom providers must call options.onPayload in streamSimple); capture cancelled`,
        "warning",
      );
    }

    // Output test: the pending capture attaches to the loop's final reply.
    // A tool-calling assistant message ends its own turn but not the loop,
    // so hold the capture until a message that stops for another reason.
    if (pendingTest === null) return;
    if (event?.message?.stopReason === "toolUse") return;
    const pending = pendingTest;
    pendingTest = null;
    if (artifactsDir === null) {
      ctx.ui.notify("artifacts directory could not be resolved", "error");
      return;
    }
    const outputTestsDir = path.join(artifactsDir, "output-tests");
    let body: string;
    try {
      body = formatResult(
        {
          timestamp: pending.stamp,
          provider: pending.provider,
          modelId: pending.modelId,
          activeTemplate: lastEvidence?.renderedName ?? "(stock)",
          templateSha256: lastEvidence?.renderedName
            ? lastEvidence.templateSha256
            : null,
          evidence: lastEvidence,
        },
        assistantText(event?.message),
      );
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
      return;
    }
    const file = path.join(
      outputTestsDir,
      freeBase(
        outputTestsDir,
        resultBase(pending.stamp, pending.provider, pending.modelId),
        [".md"],
      ) + ".md",
    );
    const failure = writeArtifact(file, body);
    if (failure !== null) {
      ctx.ui.notify(failure, "error");
      return;
    }
    ctx.ui.notify(`wrote ${file}`);
  });

  async function actionTest(ctx: ExtensionCommandContext): Promise<void> {
    if (fixturePath === null) {
      ctx.ui.notify("fixture path could not be resolved", "error");
      return;
    }
    // sendUserMessage without deliverAs is rejected while streaming, and the
    // in-flight turn's end would then be misattributed; refuse instead.
    if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
      ctx.ui.notify("agent is busy; run the output test when idle", "error");
      return;
    }
    if (pendingTest !== null) {
      ctx.ui.notify(
        `output test ${pendingTest.stamp} is still pending; wait for its reply`,
        "error",
      );
      return;
    }
    let fixture: string;
    try {
      fixture = fs.readFileSync(fixturePath, "utf8");
    } catch (err) {
      ctx.ui.notify(
        `fixture unreadable: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
      return; // send nothing
    }
    const stamp = makeStamp(new Date());
    const { provider, modelId } = modelLabel(ctx.model);
    pendingTest = { stamp, provider: "unobserved", modelId: "unobserved" };
    armCapture(stamp);
    pi.sendUserMessage(buildTestMessage(fixture));
    ctx.ui.notify(`output test ${stamp} sent (${provider}/${modelId})`);
  }

  async function actionInspect(ctx: ExtensionCommandContext): Promise<void> {
    if (artifactsDir === null) {
      ctx.ui.notify("artifacts directory could not be resolved", "error");
      return;
    }
    const stamp = makeStamp(new Date());
    const inspectDir = path.join(artifactsDir, "inspect");
    let dump: string;
    try {
      const options = ctx.getSystemPromptOptions();
      const { agentDir } = await piFacts();
      const pin = selection(ctx);
      const selected = pin.kind === "selected" ? pin.name : null;
      let templateSha256: string | null = null;
      let reason: string | null =
        pin.kind === "invalid"
          ? pin.reason
          : "command-time inventory; render not attempted";
      if (selected && templatesDir) {
        try {
          templateSha256 = sha256(readTemplate(templatesDir, selected).content);
        } catch {
          reason = `selected template ${selected} unavailable`;
        }
      }
      dump =
        renderImmediateDump(options) +
        "\n## Selection and scoped inputs\n\n" +
        evidenceLines({
          coreSource: coreSource(options),
          selectedName: selected,
          renderedName: null,
          templateSha256,
          reason,
          instructions: instructionInventory(
            scopeFiles(options.contextFiles ?? [], agentDir),
          ),
        });
    } catch (err) {
      takeArmedCapture();
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
      return;
    }
    const file = path.join(
      inspectDir,
      freeBase(inspectDir, `${stamp}-immediate`, [".md"]) + ".md",
    );
    const failure = writeArtifact(file, dump);
    if (failure !== null) {
      takeArmedCapture(); // clear any earlier arm; nothing newly armed
      ctx.ui.notify(failure, "error");
      return;
    }
    armCapture(stamp);
    ctx.ui.notify(
      `wrote ${file}; send any message to capture the ground-truth dump`,
    );
  }

  const resetSession = async () => {
    lastEvidence = null;
    lastWarning = null;
    pendingTest = null;
    takeArmedCapture();
  };
  pi.on("session_start", resetSession);
  pi.on("session_tree", resetSession);

  async function runAction(
    action: Action,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    switch (action) {
      case "switch":
        return actionSwitch(ctx);
      case "new":
        return actionNew(ctx);
      case "inspect":
        return actionInspect(ctx);
      case "test":
        return actionTest(ctx);
    }
  }

  pi.registerCommand("sysprompt", {
    description: "Manage system prompt templates",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg.startsWith("switch "))
        return actionSwitch(ctx, arg.slice(7).trim());
      let action: Action;
      if (arg === "") {
        const chosen = await ctx.ui.select("System prompt:", [...ACTIONS]);
        if (chosen === undefined) return; // cancelled
        action = chosen as Action;
      } else if ((ACTIONS as readonly string[]).includes(arg)) {
        action = arg as Action;
      } else {
        ctx.ui.notify(USAGE, "warning");
        return;
      }
      await runAction(action, ctx);
    },
  });
}
