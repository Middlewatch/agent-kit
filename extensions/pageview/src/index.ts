import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverBindHost } from "./net.ts";
import { startPageServer, type PageServer } from "./server.ts";
import { shouldAnnounce } from "./trigger.ts";
import { parseOpenCommand, resolveInsideCwd } from "./open.ts";

/**
 * pageview: serve browser artifacts (HTML, SVG, PDF, and their assets) from
 * the session cwd to a remote browser. Headless machines get a tailnet URL;
 * machines without tailscale get 127.0.0.1 for an SSH port-forward. The
 * server starts on first use and dies with the session.
 */
export default function pageviewExtension(pi: ExtensionAPI): void {
  let server: PageServer | undefined;
  let starting: Promise<PageServer> | undefined;
  const announced = new Set<string>();
  let autoBroken = false; // one failed auto-start stops the spam; /serve still retries
  let closed = false;

  async function ensureServer(ctx: ExtensionContext): Promise<PageServer> {
    if (closed) throw new Error("pageview: session is shutting down");
    if (server) return server;
    starting ??= (async () => {
      const bind = await discoverBindHost();
      const started = await startPageServer({ docroot: ctx.cwd, host: bind.host });
      if (closed) {
        // Shutdown raced the lazy start; never leave an orphan port open.
        await started.close().catch(() => {});
        throw new Error("pageview: session shut down during server start");
      }
      if (!bind.tailnet && ctx.hasUI) {
        ctx.ui.notify(
          "pageview: no tailnet interface found, bound 127.0.0.1 (reach it through an SSH port-forward)",
          "warning",
        );
      }
      server = started;
      return started;
    })();
    try {
      return await starting;
    } catch (err) {
      starting = undefined; // a later /serve retries from scratch
      throw err;
    }
  }

  /** Realpath-containment check: the file must truly live inside the cwd. */
  async function realInsideCwd(cwd: string, absolute: string): Promise<string | undefined> {
    try {
      const [realCwd, real] = await Promise.all([fs.realpath(cwd), fs.realpath(absolute)]);
      const rel = path.relative(realCwd, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
      return real;
    } catch {
      return undefined;
    }
  }

  function announceUrl(ctx: ExtensionContext, url: string): void {
    if (ctx.hasUI) ctx.ui.notify(url, "info");
    if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
      try {
        spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      } catch {}
    }
  }

  pi.on("session_shutdown", async () => {
    closed = true;
    const pending = starting;
    server = undefined;
    starting = undefined;
    announced.clear();
    if (pending) {
      try {
        const s = await pending;
        await s.close();
      } catch {}
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (autoBroken) return;
    const input = event.input as { path?: unknown } | undefined;
    const hit = shouldAnnounce(
      {
        toolName: event.toolName,
        path: typeof input?.path === "string" ? input.path : undefined,
        isError: event.isError === true,
        cwd: ctx.cwd,
      },
      announced,
    );
    if (!hit) return;
    const real = await realInsideCwd(ctx.cwd, hit.absolute);
    if (!real) return;
    try {
      const running = await ensureServer(ctx);
      const url = running.urlFor(real);
      announced.add(hit.absolute);
      announceUrl(ctx, url);
      return {
        content: [...event.content, { type: "text" as const, text: `pageview: served at ${url}` }],
      };
    } catch (err) {
      autoBroken = true;
      if (ctx.hasUI) {
        ctx.ui.notify(
          `pageview: auto-serve disabled for this session (${err instanceof Error ? err.message : String(err)}); /serve retries manually`,
          "warning",
        );
      }
      return;
    }
  });

  // On a headless machine, a bare `xdg-open <file>` / `open <file>` has
  // nowhere to go; rewrite it into an echo of the served URL so the call
  // succeeds and the URL reaches agent and owner. DISPLAY machines open
  // locally, untouched.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return;
    const input = event.input as { command?: unknown };
    if (typeof input.command !== "string") return;
    const parsed = parseOpenCommand(input.command);
    if (!parsed) return;
    const lexical = resolveInsideCwd(ctx.cwd, parsed.target);
    if (!lexical) return;
    const real = await realInsideCwd(ctx.cwd, lexical);
    if (!real) return;
    try {
      if (!(await fs.stat(real)).isFile()) return;
    } catch {
      return;
    }
    try {
      const running = await ensureServer(ctx);
      const url = running.urlFor(real);
      announced.add(lexical);
      if (ctx.hasUI) ctx.ui.notify(url, "info");
      // Double quotes: encodeURIComponent leaves no $ ` \ " in the URL, but
      // an apostrophe in a filename survives and would break single quotes.
      input.command = `echo "pageview: no display on this machine; served at ${url}"`;
    } catch {
      return; // server failed to start; let the original command run its course
    }
  });

  pi.registerCommand("serve", {
    description: "Serve a workspace file to your browser (pageview)",
    handler: async (args, ctx) => {
      const notify = (text: string, level: "info" | "warning" | "error" = "info") => {
        if (ctx.hasUI) ctx.ui.notify(text, level);
      };
      const raw = (args ?? "").trim();
      if (!raw) {
        notify("usage: /serve <path inside the workspace>");
        return;
      }
      const absolute = path.resolve(ctx.cwd, raw);
      const real = await realInsideCwd(ctx.cwd, absolute);
      if (!real) {
        notify(
          `pageview: ${raw} is missing or resolves outside the workspace; the docroot stays at ${ctx.cwd}`,
          "warning",
        );
        return;
      }
      try {
        if (!(await fs.stat(real)).isFile()) {
          notify(`pageview: ${raw} is not a regular file`, "warning");
          return;
        }
      } catch {
        notify(`pageview: ${raw} not found`, "warning");
        return;
      }
      try {
        const running = await ensureServer(ctx);
        const url = running.urlFor(real);
        announceUrl(ctx, url);
        pi.sendMessage(
          { customType: "pageview", content: `pageview: ${raw} served at ${url}`, display: false },
          { deliverAs: "nextTurn" },
        );
      } catch (err) {
        notify(`pageview: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
}
