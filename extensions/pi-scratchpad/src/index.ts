import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { baseFor, ensureScratchpad, pruneIfEmpty, releaseOwnership, sweepExpired } from "./directory.ts";
import { resolveTtlMs } from "./paths.ts";

/** Environment variable every bash command started by pi will see. */
export const SCRATCHPAD_ENV_VAR = "PI_SCRATCHPAD";

/**
 * The path reaches the model two ways. `process.env.PI_SCRATCHPAD` is set at
 * session_start for bash and for any extension that renders the prompt
 * itself. On pi 0.86 and later, where the prompt is built from named
 * sections, a `<scratchpad>` section is added on before_agent_start. Sections
 * are keyed by name and a new name lands after `<cwd>`, so handler order does
 * not move it, and the per-session path stays at the end of the prompt where
 * it cannot split a prefix shared across sessions.
 */
export default function scratchpadExtension(pi: ExtensionAPI): void {
  let scratchpad: string | undefined;

  pi.on("session_start", async (_event, ctx) => {
    try {
      scratchpad = await ensureScratchpad(ctx.cwd, ctx.sessionManager.getSessionId());
      process.env[SCRATCHPAD_ENV_VAR] = scratchpad;
    } catch (err) {
      scratchpad = undefined;
      delete process.env[SCRATCHPAD_ENV_VAR];
      if (ctx.hasUI) ctx.ui.notify(`scratchpad unavailable: ${describe(err)}`, "warning");
      return;
    }
    // Opportunistic reaping: no timer, no daemon. A failed sweep never
    // interrupts a session — the next session start retries — but it is
    // reported, because cleanup that silently stops working is a disk-growth
    // lane that only shows up as a full filesystem.
    void sweepExpired({ base: baseFor(), keep: scratchpad, ttlMs: resolveTtlMs() })
      .then((result) => {
        if (result.failed.length > 0 && ctx.hasUI) {
          const [first] = result.failed;
          ctx.ui.notify(
            `scratchpad sweep skipped ${result.failed.length} path(s): ${first?.path} (${first?.reason})`,
            "warning",
          );
        }
      })
      .catch(() => {});
  });

  pi.on("before_agent_start", (event) => {
    if (scratchpad) event.systemPromptOptions.sections.scratchpad = scratchpadSection(scratchpad);
  });

  pi.on("session_shutdown", async () => {
    const ending = scratchpad;
    scratchpad = undefined;
    if (!ending) return;
    if (!(await pruneIfEmpty(ending))) await releaseOwnership(ending);
    // `process.env` is global to the pi process and a replacement session
    // (/new, /resume, /fork) may already have published its own path, so only
    // clear the variable if it still points at the session that is ending.
    if (process.env[SCRATCHPAD_ENV_VAR] === ending) delete process.env[SCRATCHPAD_ENV_VAR];
  });

  pi.registerCommand("scratchpad", {
    description: "Show this session's scratch directory",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(scratchpad ?? "scratchpad unavailable for this session", "info");
    },
  });
}

function scratchpadSection(path: string): string {
  return (
    `\`${path}\` (also \`$PI_SCRATCHPAD\` in bash) is a private scratch directory for this session. ` +
    "Write bulky intermediate output there instead of into the conversation: full gate and test logs, " +
    "raw command output, generated data, analysis scripts, then read back the summary. " +
    "Cite the path when you tell the user where the detail lives. It is deleted after a period of disuse."
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
