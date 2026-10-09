/**
 * Pure expansion of `/skill:name [args]` lines anywhere in a prompt.
 *
 * Pi's own expansion only fires when the whole prompt starts with
 * `/skill:`, so a skill can neither be preceded by text nor combined with a
 * second skill. This module lifts that limit: every non-fenced line that
 * starts with `/skill:` becomes the same `<skill>` block pi would emit, in
 * place, and the surrounding prompt text is kept in order.
 */

export interface SkillRef {
	name: string;
	filePath: string;
	baseDir: string;
}

export interface Expansion {
	/** The rewritten prompt; identical to the input when nothing expanded. */
	text: string;
	/** Names expanded, in order of appearance. */
	expanded: string[];
	/** Names that looked like skill lines but matched no loaded skill; left in place. */
	unknown: string[];
}

/**
 * Skill roots pi's own loader adds beyond `~/.pi/agent/skills` and
 * `<cwd>/.pi/skills` (which `loadSkills({ includeDefaults: true })` covers):
 * the kit's `~/agent-kit/skills` (pi loads it as a package, which the
 * loader's path list does not cover), then `.agents/skills` in cwd and each
 * ancestor up to and including the git root.
 */
export function skillRoots(cwd: string, home: string, exists: (p: string) => boolean): string[] {
	const roots = [`${home}/agent-kit/skills`];
	let dir = cwd;
	for (;;) {
		roots.push(`${dir}/.agents/skills`);
		const parent = dir.slice(0, dir.lastIndexOf("/")) || "/";
		if (exists(`${dir}/.git`) || parent === dir || dir === "/") break;
		dir = parent;
	}
	return roots.filter(exists);
}

const SKILL_LINE = /^\/skill:(\S+)(?:[ \t]+(.*))?$/;
const FENCE = /^\s*(```|~~~)/;

/** Byte-identical to pi's `_expandSkillCommand` framing, so the model sees one format. */
export function renderSkillBlock(skill: SkillRef, body: string): string {
	return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

export function expandSkillLines(
	text: string,
	resolve: (name: string) => SkillRef | undefined,
	readBody: (skill: SkillRef) => string,
): Expansion {
	const expanded: string[] = [];
	const unknown: string[] = [];
	let inFence = false;
	const out = text.split("\n").map((line) => {
		if (FENCE.test(line)) {
			inFence = !inFence;
			return line;
		}
		if (inFence) return line;
		const m = SKILL_LINE.exec(line);
		if (!m) return line;
		const [, name, args] = m;
		const skill = resolve(name);
		if (!skill) {
			unknown.push(name);
			return line;
		}
		expanded.push(name);
		const block = renderSkillBlock(skill, readBody(skill));
		const trimmedArgs = args?.trim();
		return trimmedArgs ? `${block}\n\n${trimmedArgs}` : block;
	});
	return { text: expanded.length ? out.join("\n") : text, expanded, unknown };
}
