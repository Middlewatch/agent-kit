/**
 * /edit — two-level picker over estate files: choose a root (skills,
 * prompts, system slots, sysprompt templates, mapped folders), then a
 * file within it, with type-to-filter. Opens neovim on the real path
 * (project-relative LSP and git context intact), resuming the session
 * on exit. Changed files trigger a runtime reload so skills and
 * templates take effect immediately.
 */
import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DynamicBorder, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, matchesKey, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { discoverEditRoots, type EditRootSpec, type EditTarget, filterTargets } from "./edit-targets.ts";
import { suspendAndEdit } from "./editor.ts";

function selectListTheme(theme: any) {
	return {
		selectedPrefix: (t: string) => theme.fg("accent", t),
		selectedText: (t: string) => theme.fg("accent", t),
		description: (t: string) => theme.fg("dim", t),
		scrollInfo: (t: string) => theme.fg("dim", t),
		noMatch: (t: string) => theme.fg("warning", t),
	};
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

/** The typed or pasted text behind this input event, if any. */
function printableFrom(data: string): string | undefined {
	if (data.startsWith(PASTE_START)) {
		const end = data.indexOf(PASTE_END);
		const body = end === -1 ? data.slice(PASTE_START.length) : data.slice(PASTE_START.length, end);
		const clean = [...body].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("");
		return clean === "" ? undefined : clean;
	}
	const kitty = decodeKittyPrintable(data);
	if (kitty !== undefined) return kitty;
	if (data.length === 1) {
		const code = data.charCodeAt(0);
		if (code >= 32 && code !== 127) return data;
	}
	return undefined;
}

/** Level one: pick a root. Resolves to its index or null on cancel. */
function pickRoot(ctx: ExtensionCommandContext, specs: EditRootSpec[], initialIndex: number): Promise<number | null> {
	return ctx.ui.custom<number | null>((tui, theme, _keybindings, done) => {
		const items: SelectItem[] = specs.map((spec, index) => ({
			value: String(index),
			label: spec.label,
			description: `${spec.targets.length} file${spec.targets.length === 1 ? "" : "s"}`,
		}));
		const list = new SelectList(items, Math.min(items.length, 12), selectListTheme(theme));
		list.setSelectedIndex(initialIndex);
		list.onSelect = (item) => done(Number(item.value));
		list.onCancel = () => done(null);
		const top = new DynamicBorder((s: string) => theme.fg("accent", s));
		const title = new Text(theme.fg("accent", theme.bold("Edit estate file")), 1, 0);
		const footer = new Text(theme.fg("dim", "↑↓ navigate · enter open · esc cancel"), 1, 0);
		const bottom = new DynamicBorder((s: string) => theme.fg("accent", s));
		return {
			render: (width: number) => [top, title, list, footer, bottom].flatMap((c) => c.render(width)),
			invalidate: () => list.invalidate(),
			handleInput: (data: string) => {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

/**
 * Level two: pick a file within a root, filtering as you type.
 * Esc clears an active filter first, then backs out (resolves null).
 */
function pickTarget(ctx: ExtensionCommandContext, spec: EditRootSpec): Promise<EditTarget | null> {
	return ctx.ui.custom<EditTarget | null>((tui, theme, _keybindings, done) => {
		let query = "";
		let filtered: EditTarget[] = spec.targets;
		let list: SelectList;

		const rebuild = (): void => {
			filtered = filterTargets(spec.targets, query);
			const items: SelectItem[] = filtered.map((target, index) => ({
				value: String(index),
				label: target.label,
				description: target.description ?? target.path,
			}));
			list = new SelectList(items, Math.min(Math.max(items.length, 1), 12), selectListTheme(theme));
			list.onSelect = (item) => {
				const target = filtered[Number(item.value)];
				if (target) done(target);
			};
			list.onCancel = () => (query === "" ? done(null) : setQuery(""));
		};
		const setQuery = (next: string): void => {
			query = next;
			rebuild();
		};
		rebuild();

		const top = new DynamicBorder((s: string) => theme.fg("accent", s));
		const bottom = new DynamicBorder((s: string) => theme.fg("accent", s));
		const footer = new Text(theme.fg("dim", "type to filter · ↑↓ · enter edit · esc back"), 1, 0);
		return {
			render: (width: number) => {
				const title = new Text(
					theme.fg("accent", theme.bold(spec.label)) + theme.fg("dim", query === "" ? "" : `  filter: ${query}`),
					1,
					0,
				);
				return [top, title, list, footer, bottom].flatMap((c) => c.render(width));
			},
			invalidate: () => list.invalidate(),
			handleInput: (data: string) => {
				const char = printableFrom(data);
				if (char !== undefined) setQuery(query + char);
				else if (matchesKey(data, "backspace")) setQuery(query.slice(0, -1));
				else list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

function mtimeOf(path: string): number | undefined {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return undefined;
	}
}

export function registerEditCommand(pi: ExtensionAPI): void {
	pi.registerCommand("edit", {
		description: "Browse and edit estate files (skills, prompts, system, mapped folders) in the external editor",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/edit needs the interactive TUI", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("/edit waits for the agent to finish — try again when idle", "warning");
				return;
			}

			const specs = discoverEditRoots({
				agentsDir: join(homedir(), ".agents"),
				piAgentDir: join(homedir(), ".pi", "agent"),
				cwd: ctx.cwd,
			});
			if (specs.length === 0) {
				ctx.ui.notify("Nothing to edit: no skills, templates, or system prompt files found", "warning");
				return;
			}

			let target: EditTarget | null = null;
			let rootIndex = 0;
			while (target === null) {
				const picked = await pickRoot(ctx, specs, rootIndex);
				if (picked === null) return;
				rootIndex = picked;
				target = await pickTarget(ctx, specs[rootIndex]); // null = esc, back to roots
			}

			const path = target.path;
			const before = mtimeOf(path);
			mkdirSync(dirname(path), { recursive: true });
			const outcome = await suspendAndEdit(ctx, path);
			if (outcome.status !== "complete") {
				ctx.ui.notify(`Editor ${outcome.status}${outcome.detail ? `: ${outcome.detail}` : ""}`, "warning");
				return;
			}
			if (mtimeOf(path) !== before) {
				ctx.ui.notify(`Saved ${path}; reloading runtime`, "info");
				await ctx.reload();
				return;
			}
			ctx.ui.notify("No changes", "info");
		},
	});
}
