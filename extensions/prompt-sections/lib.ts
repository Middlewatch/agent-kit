/**
 * Pure text steps for prompt-sections: take a stock section's body out of
 * pi's rendered prompt, add the owner's material, and hand it back.
 */

/**
 * The body of the first top-level `<name>` section in a rendered prompt, or
 * undefined when pi's `<name>\n…\n</name>` wrapper is not found. `tools` and
 * `rules` sit before any user-authored text, so the first match is pi's own.
 */
export function liftSection(prompt: string, name: string): string | undefined {
	const open = `\n\n<${name}>\n`;
	const close = `\n</${name}>`;
	const start = prompt.indexOf(open);
	if (start < 0) return undefined;
	const bodyStart = start + open.length;
	const end = prompt.indexOf(close, bodyStart);
	if (end < 0) return undefined;
	return prompt.slice(bodyStart, end);
}

export const LOCAL_TOOLS_LEAD =
	"CLI tools installed on this machine beyond the standard set; details and caveats in ~/.agents/system-tools-index.md.";

/** The stock tools body with the local CLI roster after it; unchanged when the roster is empty. */
export function withLocalTools(toolsBody: string, roster: string): string {
	const lines = roster.trim();
	if (!lines) return toolsBody;
	return `${toolsBody}\n\n${LOCAL_TOOLS_LEAD}\n${lines}`;
}

/** Rules named one per line; blank lines and `#` comments are skipped, a leading `- ` is optional. */
export function parseDropList(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => line.replace(/^- /, ""));
}

/** The stock rules body minus the dropped bullets, with the owner's rules after it. */
export function withRules(rulesBody: string, drop: string[], custom: string): string {
	const dropped = new Set(drop.map((rule) => `- ${rule}`));
	const kept = rulesBody.split("\n").filter((line) => !dropped.has(line.trimEnd()));
	const extra = custom.trim();
	return extra ? `${kept.join("\n")}\n${extra}` : kept.join("\n");
}
