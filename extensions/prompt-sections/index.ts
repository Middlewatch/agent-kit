/**
 * prompt-sections — add the owner's material to pi's stock `<tools>` and
 * `<rules>` sections and leave the rest of pi's prompt construction alone.
 *
 * On `before_agent_start` the handler takes the two section bodies from pi's
 * own rendering (`event.systemPrompt`), appends the local CLI roster to
 * `<tools>`, removes the rules listed in `~/agent-kit/guidance/rules-drop.txt` from
 * `<rules>`, then sets both through `options.sections`, where a stock name
 * replaces the section in place. Pi still builds, diffs, and
 * persists every section.
 *
 * It changes nothing when a custom or forced prompt is in effect (pi builds
 * no stock sections then), and nothing, with one warning, when either
 * wrapper is missing from the rendering.
 *
 * `/sysprompt` shows the prompt. Once the session has a turn it reads the
 * system messages pi recorded in the transcript, so every extension's
 * sections and every mid-session patch are there. Before that it shows pi's
 * rendering of the loaded inputs with this extension's two overrides applied.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	describePatches,
	foldSections,
	overrides,
	parseDropList,
	previewPrompt,
	type SectionInputs,
	type SystemRecord,
	sectionSizes,
} from "./lib.ts";
import { DEFAULT_INDEX_PATH, readLocalTools } from "./local-tools.ts";
import { type PromptView, PromptViewer } from "./viewer-ui.ts";

/** The drop list sits beside the global guide in the kit's `guidance/`. */
const DROP_LIST = join(homedir(), "agent-kit", "guidance", "rules-drop.txt");

function readOptional(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function readInputs(): SectionInputs {
	return {
		roster: readLocalTools(),
		drop: parseDropList(readOptional(DROP_LIST)),
	};
}

function buildView(ctx: ExtensionCommandContext): PromptView {
	const inputs = readInputs();
	const options = ctx.getSystemPromptOptions();
	const records = ctx.sessionManager
		.buildSessionProjection()
		.messages.filter((message) => message.role === "system") as unknown as SystemRecord[];
	const sent = foldSections(records);
	const hasSent = Object.keys(sent).length > 0;
	const prompt = hasSent
		? Object.values(sent).join("\n\n")
		: (previewPrompt(ctx.getSystemPrompt(), inputs) ?? ctx.getSystemPrompt());
	const sources = [
		hasSent ? `Sections\n${sectionSizes(sent)}` : `Prompt  ${prompt.length} chars`,
		`Context files\n${(options.contextFiles ?? []).map((file) => `${file.path}  ${file.content.length} chars`).join("\n") || "(none)"}`,
		[
			"prompt-sections inputs",
			`${DROP_LIST}  ${inputs.drop.length} rule(s)`,
			`${DEFAULT_INDEX_PATH}  ${inputs.roster ? inputs.roster.split("\n").length : 0} tool(s) on PATH`,
		].join("\n"),
	].join("\n\n");
	return {
		title: hasSent ? "System prompt as sent" : "System prompt preview",
		boundary: hasSent
			? `SENT · from this session's transcript · ${records.length - 1} change(s) since the first message`
			: "PREVIEW · not sent · pi's loaded inputs + prompt-sections; other extensions' sections appear after the first turn",
		tabs: [
			{ name: "prompt", text: prompt },
			{ name: "sources", text: sources },
			...(hasSent ? [{ name: "changes", text: describePatches(records) }] : []),
		],
	};
}

export default function (pi: ExtensionAPI) {
	let warned = false;

	pi.on("session_start", () => {
		warned = false;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const options = event.systemPromptOptions;
		if (!options?.sections || options.customPrompt || options.forceSystemPrompt !== undefined) return;

		const next = overrides(event.systemPrompt, readInputs());
		if (!next) {
			if (!warned && ctx.hasUI) {
				ctx.ui.notify("prompt-sections: pi's <tools>/<rules> wrapper not found; stock prompt left as is", "warning");
			}
			warned = true;
			return;
		}
		options.sections.tools = next.tools;
		options.sections.rules = next.rules;
	});

	pi.registerCommand("sysprompt", {
		description: "View the system prompt: as sent, or a preview before the first turn",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/sysprompt needs the interactive TUI", "warning");
				return;
			}
			const view = buildView(ctx);
			await ctx.ui.custom<void>(
				(tui, theme, _keys, done) => new PromptViewer(view, theme, () => Math.max(1, tui.terminal.rows - 2), done),
				{ overlay: true, overlayOptions: { width: "100%", maxHeight: "100%" } },
			);
		},
	});
}
