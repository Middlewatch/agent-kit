/**
 * Startup header: centered pi glyph (solid roof, legs dissolving through
 * shade blocks) over the workspace, branch, and cheap estate counts.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Style } from "./gutter.ts";

export interface HeaderFacts {
	workspace: string;
	branch?: string;
	skills?: number;
	extensions?: number;
	inboxNotes?: number;
}

const GLYPH_ROWS: Array<{ chars: string; color: "accent" | "muted" | "dim" }> = [
	{ chars: "██████████████", color: "accent" },
	{ chars: "  ██      ██  ", color: "accent" },
	{ chars: "  ▓▓      ▓▓  ", color: "muted" },
	{ chars: "  ▒▒      ▒▒  ", color: "dim" },
	{ chars: "  ░░      ░░  ", color: "dim" },
];

export function piGlyph(style: Style): string[] {
	return GLYPH_ROWS.map((row) => style.fg(row.color, row.chars));
}

export function center(line: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return truncateToWidth(" ".repeat(pad) + line, width);
}

export function workspaceLine(facts: HeaderFacts, style: Style): string {
	let line = style.fg("text", facts.workspace);
	if (facts.branch) line += ` ${style.fg("accent", "⎇")} ${style.fg("muted", facts.branch)}`;
	return line;
}

export function estateLine(facts: HeaderFacts, style: Style): string {
	const parts: string[] = [];
	if (facts.skills !== undefined) parts.push(`${style.fg("dim", "skills")} ${style.fg("muted", `${facts.skills}`)}`);
	if (facts.extensions !== undefined)
		parts.push(`${style.fg("dim", "extensions")} ${style.fg("muted", `${facts.extensions}`)}`);
	if (facts.inboxNotes !== undefined)
		parts.push(`${style.fg("dim", "inbox")} ${style.fg("muted", `${facts.inboxNotes}`)}`);
	return parts.join(style.fg("dim", " · "));
}

export function buildHeaderLines(facts: HeaderFacts, style: Style, width: number): string[] {
	const lines: string[] = [""];
	for (const row of piGlyph(style)) lines.push(center(row, width));
	lines.push("");
	lines.push(center(workspaceLine(facts, style), width));
	const estate = estateLine(facts, style);
	if (estate !== "") lines.push(center(estate, width));
	lines.push("");
	return lines;
}
