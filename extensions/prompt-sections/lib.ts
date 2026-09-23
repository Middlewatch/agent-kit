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

/** The stock rules body minus the dropped bullets. */
export function withRules(rulesBody: string, drop: string[]): string {
	const dropped = new Set(drop.map((rule) => `- ${rule}`));
	return rulesBody
		.split("\n")
		.filter((line) => !dropped.has(line.trimEnd()))
		.join("\n");
}

export interface SectionInputs {
	roster: string;
	drop: string[];
}

/** The two overridden bodies for a rendered prompt, or undefined when either wrapper is missing. */
export function overrides(prompt: string, inputs: SectionInputs): { tools: string; rules: string } | undefined {
	const tools = liftSection(prompt, "tools");
	const rules = liftSection(prompt, "rules");
	if (tools === undefined || rules === undefined) return undefined;
	return { tools: withLocalTools(tools, inputs.roster), rules: withRules(rules, inputs.drop) };
}

/** The rendered prompt with the two overrides written back, as the next request would carry them. */
export function previewPrompt(prompt: string, inputs: SectionInputs): string | undefined {
	const next = overrides(prompt, inputs);
	if (!next) return undefined;
	let out = prompt;
	for (const [name, body] of Object.entries(next)) {
		const old = liftSection(out, name) as string;
		const at = out.indexOf(`\n\n<${name}>\n`) + name.length + 5;
		out = out.slice(0, at) + body + out.slice(at + old.length);
	}
	return out;
}

/** A transcript system message, reduced to what the viewer reads. */
export interface SystemRecord {
	timestamp: number;
	sections?: Record<string, string | null>;
	toolsAdded?: { name: string }[];
	toolsRemoved?: string[];
}

/** Sections as the model currently has them: each record's patch applied in order. */
export function foldSections(records: SystemRecord[]): Record<string, string> {
	const current = new Map<string, string>();
	for (const record of records) {
		for (const [name, value] of Object.entries(record.sections ?? {})) {
			if (value === null) current.delete(name);
			else current.set(name, value);
		}
	}
	return Object.fromEntries(current);
}

/** One paragraph per system message after the first: when, which sections, which tools. */
export function describePatches(records: SystemRecord[]): string {
	if (records.length < 2) return "No changes since the first system message.";
	return records
		.slice(1)
		.map((record, i) => {
			const lines = [`#${i + 1}  ${new Date(record.timestamp).toLocaleTimeString()}`];
			for (const [name, value] of Object.entries(record.sections ?? {})) {
				lines.push(value === null ? `  removed <${name}>` : `  updated <${name}>  ${value.length} chars`);
			}
			if (record.toolsAdded?.length) lines.push(`  tools added: ${record.toolsAdded.map((t) => t.name).join(", ")}`);
			if (record.toolsRemoved?.length) lines.push(`  tools removed: ${record.toolsRemoved.join(", ")}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

/** Name and size of each section, in prompt order. */
export function sectionSizes(sections: Record<string, string>): string {
	return Object.entries(sections)
		.map(([name, text]) => `${name.padEnd(18)} ${String(text.length).padStart(7)} chars`)
		.join("\n");
}
