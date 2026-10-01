/**
 * bash-guide — add a `<bash>` section to pi's system prompt holding the
 * rules in `guide.md`: fixes for the bash mistakes found in the session
 * logs, and batching rules that ask for the fan-out codemode's guideline
 * asks for, done with shell jobs.
 *
 * The section is set on `before_agent_start` under its own name, so it
 * lands after `<cwd>` whatever the handler order, and only while the bash
 * tool is active. The guide is read on every prompt, so an edit takes effect
 * on the next one. A custom or forced prompt gets no section, because pi
 * builds no sections then.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bashSection } from "./lib.ts";

const GUIDE_PATH = join(dirname(fileURLToPath(import.meta.url)), "guide.md");

function readGuide(): string {
	try {
		return readFileSync(GUIDE_PATH, "utf8");
	} catch {
		return "";
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const options = event.systemPromptOptions;
		if (!options?.sections || options.customPrompt || options.forceSystemPrompt !== undefined) return;
		const section = bashSection(readGuide(), options.selectedTools);
		if (section) options.sections.bash = section;
		else delete options.sections.bash;
	});
}
