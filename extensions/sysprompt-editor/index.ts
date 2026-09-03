/**
 * sysprompt-editor: owner-authored core system prompt.
 *
 * Rebuilds the core of Pi's system prompt (identity, tool list, guidelines,
 * Pi documentation) from the active template in the kit's
 * guidance/sysprompt/. The template
 * owns the prose; the harness owns the live data, spliced in through five
 * optional placeholders:
 *
 *   {{AVAILABLE_TOOLS}}  the "- tool: snippet" lines for the active tool set
 *   {{GUIDELINES}}       the per-tool guideline bullets for the active tool set
 *   {{PI_DOCS}}          the Pi documentation section (paths + routing rules)
 *   {{PI_SCRATCHPAD}}    one bullet naming the session scratch directory, read
 *                        from process.env.PI_SCRATCHPAD (published by the
 *                        pi-scratchpad extension); empty when unset
 *   {{SKILLS}}           pi's skills block, lifted out of the tail so the
 *                        template chooses its position (after the tools,
 *                        in the owner's template); neoskills then splices
 *                        its registry into that block wherever it sits
 *
 * Everything else after the core (project_context/AGENTS.md, cwd) is left
 * untouched, so context files keep layering normally and the claude-go
 * bridge forwards the rewritten prompt as-is.
 *
 * Fail-open posture: if a SYSTEM.md/--system-prompt custom prompt is active,
 * if the stock template shape is unrecognized (a pi update changed it), or if
 * no template resolves (pointer and default.md both unusable), the prompt is
 * left exactly as Pi built it.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  armCapture,
  awaitWireRecord,
  extractSystemPromptFromPayload,
  freeBase,
  listDir,
  makeStamp,
  modelLabel,
  renderImmediateDump,
  renderProviderDump,
  renderWireDump,
  takeArmedCapture,
} from "./lib/inspect.ts";
import {
  assistantText,
  buildTestMessage,
  formatResult,
  resultBase,
} from "./lib/output-test.ts";
import { liftSkillsBlock, renderTemplate, splitTail } from "./lib/splice.ts";
import {
  listTemplates,
  readActiveTemplate,
  scaffoldTemplate,
  setActiveTemplate,
} from "./lib/templates.ts";

const STOCK_FIRST_LINE =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";

const ACTIONS = ["switch", "new", "inspect", "test"] as const;
type Action = (typeof ACTIONS)[number];
const USAGE = "usage: /sysprompt [switch|new|inspect|test]";

/**
 * Filesystem locations the extension works against. Pi calls the default
 * export with no paths and the URL-resolved defaults apply; tests pass temp
 * directories. This is the only injection mechanism.
 */
export interface ExtensionPaths {
  templatesDir?: string;
  artifactsDir?: string;
  fixturePath?: string;
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

  // What the last before_agent_start actually applied: the template's name
  // and content sha256, or null when a stand-down or fail-open branch left
  // the stock prompt. The output-test result header reads it at turn_end.
  let lastRender: { name: string; sha256: string } | null = null;

  // Output test awaiting its turn_end.
  let pendingTest: {
    stamp: string;
    provider: string;
    modelId: string;
  } | null = null;

  pi.on("before_agent_start", async (event: any) => {
    lastRender = null;
    const prompt: string = event.systemPrompt ?? "";
    if (event.systemPromptOptions?.customPrompt) return; // SYSTEM.md wins
    if (!prompt.startsWith(STOCK_FIRST_LINE)) return; // already rewritten or non-stock
    if (templatesDir === null) return; // URL resolution failed: stock stands

    const active = readActiveTemplate(templatesDir);
    if (active === null) return; // no template resolves: stock prompt stands

    const [core, fullTail] = splitTail(prompt);
    // A template with {{SKILLS}} takes pi's skills block out of the tail
    // and places it itself; without the placeholder the tail is untouched.
    const [skills, tail] = active.content.includes("{{SKILLS}}")
      ? liftSkillsBlock(fullTail)
      : ["", fullTail];
    const rendered = renderTemplate(
      active.content,
      core,
      process.env.PI_SCRATCHPAD,
      skills,
    );
    if (rendered === null) return; // shape drifted: fail open
    lastRender = {
      name: active.name,
      sha256: createHash("sha256").update(active.content, "utf8").digest("hex"),
    };
    return { systemPrompt: rendered + tail };
  });

  async function actionSwitch(ctx: ExtensionCommandContext): Promise<void> {
    if (templatesDir === null) {
      ctx.ui.notify("templates directory could not be resolved", "error");
      return;
    }
    const names = listTemplates(templatesDir);
    if (names.length === 0) {
      ctx.ui.notify("no templates found", "warning");
      return;
    }
    const chosen = await ctx.ui.select("Active template:", names);
    if (chosen === undefined) return; // cancelled: no write
    try {
      setActiveTemplate(templatesDir, chosen);
    } catch (err) {
      ctx.ui.notify(String((err as Error).message ?? err), "error");
      return;
    }
    ctx.ui.notify(`active template: ${chosen} (applies next message)`);
  }

  async function actionNew(ctx: ExtensionCommandContext): Promise<void> {
    if (templatesDir === null) {
      ctx.ui.notify("templates directory could not be resolved", "error");
      return;
    }
    const name = await ctx.ui.input("Template name:");
    if (name === undefined) return; // cancelled: no write
    const active = readActiveTemplate(templatesDir);
    if (active === null) {
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

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    const stamp = takeArmedCapture();
    if (stamp === null) return;
    if (artifactsDir === null) {
      ctx.ui.notify("artifacts directory could not be resolved", "error");
      return;
    }
    const inspectDir = path.join(artifactsDir, "inspect");
    const { provider, modelId } = modelLabel(ctx.model);
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
          activeTemplate: lastRender?.name ?? "(stock)",
          templateSha256: lastRender?.sha256 ?? null,
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
    pendingTest = { stamp, provider, modelId };
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
      dump = renderImmediateDump(ctx.getSystemPromptOptions());
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
