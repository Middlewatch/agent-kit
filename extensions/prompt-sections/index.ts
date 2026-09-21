/**
 * prompt-sections — add the owner's material to pi's stock `<tools>` and
 * `<rules>` sections and leave the rest of pi's prompt construction alone.
 *
 * On `before_agent_start` the handler takes the two section bodies from pi's
 * own rendering (`event.systemPrompt`), appends the local CLI roster to
 * `<tools>`, removes the rules listed in `rules-drop.txt` and appends
 * `RULES.md` to `<rules>`, then sets both through `options.sections`, where a
 * stock name replaces the section in place. Pi still builds, diffs, and
 * persists every section.
 *
 * It changes nothing when a custom or forced prompt is in effect (pi builds
 * no stock sections then), and nothing, with one warning, when either
 * wrapper is missing from the rendering.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { liftSection, parseDropList, withLocalTools, withRules } from "./lib.ts";
import { readLocalTools } from "./local-tools.ts";

const PROMPT_DIR = join(homedir(), ".agents", "kit", "guidance", "prompt");

function readOptional(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

export default function (pi: ExtensionAPI) {
	let warned = false;

	pi.on("session_start", () => {
		warned = false;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const options = event.systemPromptOptions;
		if (!options?.sections || options.customPrompt || options.forceSystemPrompt !== undefined) return;

		const prompt = event.systemPrompt;
		const tools = liftSection(prompt, "tools");
		const rules = liftSection(prompt, "rules");
		if (tools === undefined || rules === undefined) {
			if (!warned && ctx.hasUI) {
				ctx.ui.notify("prompt-sections: pi's <tools>/<rules> wrapper not found; stock prompt left as is", "warning");
			}
			warned = true;
			return;
		}

		options.sections.tools = withLocalTools(tools, readLocalTools());
		options.sections.rules = withRules(
			rules,
			parseDropList(readOptional(join(PROMPT_DIR, "rules-drop.txt"))),
			readOptional(join(PROMPT_DIR, "RULES.md")),
		);
	});
}
