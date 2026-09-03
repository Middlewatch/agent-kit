/**
 * Empirical probes of the terminal, run live by the owner:
 *
 * /pitui-probe-scroll — toggles a 1 Hz footer status counter. Scroll into
 * history while it ticks; the probe passes if the viewport stays put.
 *
 * /pitui-probe-suspend — suspends the TUI and opens the editor on a real
 * file, resuming on exit. Passes if the session redraws cleanly afterward.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { suspendAndEdit } from "./editor.ts";

export function registerProbes(pi: ExtensionAPI): void {
	let ticker: ReturnType<typeof setInterval> | undefined;

	pi.registerCommand("pitui-probe-scroll", {
		description: "Probe: 1 Hz status updates; scroll up and watch whether the viewport holds",
		handler: async (_args, ctx) => {
			if (ticker) {
				clearInterval(ticker);
				ticker = undefined;
				ctx.ui.setStatus("pitui-probe", undefined);
				ctx.ui.notify("Scroll probe stopped", "info");
				return;
			}
			let tick = 0;
			ticker = setInterval(() => {
				tick += 1;
				ctx.ui.setStatus("pitui-probe", `scroll probe tick ${tick}`);
			}, 1000);
			ctx.ui.notify("Scroll probe started: scroll into history, watch for viewport yanks, rerun to stop", "info");
		},
	});

	pi.registerCommand("pitui-probe-suspend", {
		description: "Probe: suspend the TUI, open the editor on a real file, resume",
		handler: async (_args, ctx) => {
			const dir = mkdtempSync(join(tmpdir(), "pitui-probe-"));
			const file = join(dir, "probe.md");
			writeFileSync(file, "# Suspend probe\n\nEdit, save, quit. Pi should resume cleanly.\n", "utf-8");
			const outcome = await suspendAndEdit(ctx, file);
			ctx.ui.notify(
				outcome.status === "complete"
					? "Suspend probe: editor exited, TUI resumed"
					: `Suspend probe: ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ""}`,
				outcome.status === "complete" ? "info" : "warning",
			);
		},
	});

	pi.on("session_shutdown", async () => {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
	});
}
