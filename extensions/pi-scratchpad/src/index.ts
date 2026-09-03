import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { baseFor, ensureScratchpad, pruneIfEmpty, releaseOwnership, sweepExpired } from "./directory.ts";
import { resolveTtlMs } from "./paths.ts";

/** Environment variable every bash command started by pi will see. */
export const SCRATCHPAD_ENV_VAR = "PI_SCRATCHPAD";

/**
 * This extension does not touch the system prompt. It publishes the path in
 * `process.env.PI_SCRATCHPAD` at session_start, and the prompt owner
 * (sysprompt-editor's `{{PI_SCRATCHPAD}}` placeholder) reads it from there.
 * Extension load order is filesystem readdir order, so a before_agent_start
 * append here could land before or after the template splice; the env var is
 * the only channel with no ordering dependence.
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

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
