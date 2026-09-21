/**
 * skill-inline — expand `/skill:name [args]` on any line of a prompt, and
 * more than one per prompt, so a skill can sit between the text that frames
 * it and the text that follows it.
 *
 * Pi's own expansion handles only a prompt whose first characters are
 * `/skill:`. This extension runs on the `input` event, before that step,
 * rewrites every non-fenced skill line into pi's own `<skill>` block, and
 * hands the result on. A prompt pi would have expanded itself comes out
 * identical, so the first-line habit keeps working.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
	type ExtensionAPI,
	getAgentDir,
	loadSkills,
	type Skill,
	stripFrontmatter,
} from "@earendil-works/pi-coding-agent";
import { expandSkillLines, type SkillRef, skillRoots } from "./lib.ts";

export default function (pi: ExtensionAPI) {
	// The exact loaded set (package skills included) is only visible on
	// before_agent_start, which fires after input expansion. Cache it for the
	// next prompt and use pi's directory discovery for the first one.
	let loaded: Skill[] | undefined;

	pi.on("before_agent_start", (event) => {
		loaded = event.systemPromptOptions.skills ?? loaded;
	});

	pi.on("input", (event, ctx) => {
		if (!event.text.includes("/skill:")) return;
		const skills =
			loaded ??
			loadSkills({
				cwd: ctx.cwd,
				agentDir: getAgentDir(),
				skillPaths: skillRoots(ctx.cwd, homedir(), existsSync),
				includeDefaults: true,
			}).skills;
		try {
			const result = expandSkillLines(
				event.text,
				(name) => skills.find((s) => s.name === name),
				(skill: SkillRef) => stripFrontmatter(readFileSync(skill.filePath, "utf-8")).trim(),
			);
			for (const name of result.unknown) ctx.ui.notify(`skill-inline: no skill named ${name}`, "warning");
			if (result.expanded.length === 0) return;
			return { action: "transform", text: result.text, images: event.images };
		} catch (err) {
			ctx.ui.notify(`skill-inline: ${err instanceof Error ? err.message : String(err)}`, "error");
			return;
		}
	});
}
