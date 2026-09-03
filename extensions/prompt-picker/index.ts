/**
 * Prompt picker — /prompt opens a filterable list of the kit's prompt
 * library (`prompts/` at the kit root) with a live preview, and inserts the
 * chosen template's body into the editor for review before sending.
 *
 * The same files also load as native pi templates via the kit's package
 * manifest, so every library entry doubles as its own /name command; the
 * picker is the browsable front door for the ones you don't remember.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
	Container,
	decodeKittyPrintable,
	matchesKey,
	type SelectItem,
	SelectList,
	Text,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { loadPromptDir, type PromptTemplate } from "./lib.ts";

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");
const PREVIEW_LINES = 12;

/** Plain typed or pasted text: no control characters, not an escape sequence. */
function asTextInput(data: string): string | undefined {
	const pasted = data.startsWith("\x1b[200~") && data.endsWith("\x1b[201~") ? data.slice(6, -6) : data;
	if (pasted.length === 0) return undefined;
	for (const ch of pasted) {
		const cp = ch.codePointAt(0) ?? 0;
		if (cp < 0x20 || cp === 0x7f) return undefined;
	}
	return pasted;
}

async function pickInTui(
	ctx: ExtensionContext,
	prompts: PromptTemplate[],
	initialFilter: string,
): Promise<string | null> {
	return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const items: SelectItem[] = prompts.map((p) => ({
			value: p.name,
			label: p.name,
			description: p.argumentHint ? `${p.argumentHint} — ${p.description}` : p.description,
		}));

		let filter = initialFilter;
		let selected: PromptTemplate | undefined;

		const selectList = new SelectList(items, Math.min(items.length, 10), {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		});

		const syncSelection = () => {
			const item = selectList.getSelectedItem();
			selected = item ? prompts.find((p) => p.name === item.value) : undefined;
		};

		const applyFilter = () => {
			selectList.setFilter(filter);
			selectList.setSelectedIndex(0);
			syncSelection();
		};

		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);
		selectList.onSelectionChange = () => syncSelection();
		applyFilter();

		const title = {
			render: (w: number) => [
				truncateToWidth(theme.fg("accent", theme.bold("Prompt library")) + theme.fg("dim", filter ? `  filter: ${filter}` : "  type to filter"), w),
			],
			invalidate: () => {},
		};

		const preview = {
			render: (w: number) => {
				if (!selected) return [];
				const lines = selected.body.split("\n");
				const shown = lines.slice(0, PREVIEW_LINES).map((line) => truncateToWidth(theme.fg("muted", line), w));
				if (lines.length > PREVIEW_LINES) shown.push(theme.fg("dim", `… ${lines.length - PREVIEW_LINES} more lines`));
				return ["", theme.fg("dim", "─ preview ─"), ...shown];
			},
			invalidate: () => {},
		};

		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(title);
		container.addChild(selectList);
		container.addChild(preview);
		container.addChild(new Text(theme.fg("dim", "↑↓ navigate • type to filter • enter insert • esc cancel"), 0, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				const text = decodeKittyPrintable(data) ?? asTextInput(data);
				if (matchesKey(data, "backspace")) {
					filter = [...filter].slice(0, -1).join("");
					applyFilter();
				} else if (text !== undefined) {
					filter += text;
					applyFilter();
				} else {
					selectList.handleInput(data);
				}
				tui.requestRender();
			},
		};
	});
}

export default function promptPicker(pi: ExtensionAPI) {
	pi.registerCommand("prompt", {
		description: "Pick a prompt from the kit library and insert it into the editor",
		getArgumentCompletions: (prefix: string) => {
			const items = loadPromptDir(PROMPTS_DIR)
				.filter((p) => p.name.startsWith(prefix))
				.map((p) => ({ value: p.name, label: p.name, description: p.description }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const prompts = loadPromptDir(PROMPTS_DIR);
			if (prompts.length === 0) {
				ctx.ui.notify(`No prompt templates found in ${PROMPTS_DIR}`, "warning");
				return;
			}

			const filter = (args ?? "").trim();
			let choice: string | null = null;
			if (ctx.mode === "tui") {
				choice = await pickInTui(ctx, prompts, filter);
			} else if (ctx.hasUI) {
				let names = prompts.map((p) => p.name).filter((n) => n.startsWith(filter));
				if (filter && names.length === 0) {
					ctx.ui.notify(`No prompt matches "${filter}"; showing all`, "warning");
					names = prompts.map((p) => p.name);
				}
				choice = (await ctx.ui.select("Pick a prompt:", names)) ?? null;
			}
			if (!choice) return;

			const template = prompts.find((p) => p.name === choice);
			if (template) ctx.ui.setEditorText(template.body);
		},
	});
}
