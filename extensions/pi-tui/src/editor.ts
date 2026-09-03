import { spawn } from "node:child_process";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export interface EditOutcome {
	status: "complete" | "failed" | "no-tui";
	detail?: string;
}

/** Pick the editor command: $VISUAL, then $EDITOR, then nvim. */
export function editorCommand(env: NodeJS.ProcessEnv = process.env): string {
	return env.VISUAL?.trim() || env.EDITOR?.trim() || "nvim";
}

/**
 * Suspend the TUI, open `filePath` in the external editor, resume on exit.
 * Same stop/spawn/start pattern pi uses for its ctrl+g external editor,
 * but on the real file path so LSP and git context stay intact.
 */
export async function suspendAndEdit(ctx: ExtensionCommandContext, filePath: string): Promise<EditOutcome> {
	if (ctx.mode !== "tui") return { status: "no-tui" };

	const command = editorCommand();
	return await ctx.ui.custom<EditOutcome>((tui, _theme, _keybindings, done) => {
		void (async () => {
			// In fullscreen, a bare stop() dumps the whole rendered frame
			// (prompt box, footer) onto the main screen, leaving one stray
			// copy in scrollback per /edit. Preserve the screen instead;
			// regular mode keeps the bare stop so the editor opens below
			// the transcript, matching pi's own ctrl+g behavior.
			tui.stop(tui.mode === "fullscreen" ? { preserveScreen: true } : undefined);
			let outcome: EditOutcome;
			try {
				const [editor, ...args] = command.split(" ");
				const exitCode = await new Promise<number | null>((resolve) => {
					const child = spawn(editor as string, [...args, filePath], { stdio: "inherit" });
					child.on("error", () => resolve(null));
					child.on("close", (code) => resolve(code));
				});
				outcome =
					exitCode === 0
						? { status: "complete" }
						: { status: "failed", detail: exitCode === null ? `could not launch ${editor}` : `exit code ${exitCode}` };
			} finally {
				tui.start();
				tui.requestRender(true);
			}
			done(outcome);
		})();
		return { render: () => [], invalidate() {} };
	});
}
