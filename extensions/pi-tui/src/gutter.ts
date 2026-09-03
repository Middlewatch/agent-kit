/**
 * Gutter-style tool rendering: no background fill, a status-glyph header,
 * output behind a dim vertical gutter, and a closing status line.
 *
 *   ● bash git status --short
 *   │ M src/index.ts
 *   │ ?? notes.md
 *   ╰ ok · 0.4s · 12 lines hidden
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

/** The slice of Theme the gutter renderers use; tests inject a fake. */
export type Style = Pick<Theme, "fg" | "bold">;

export type GlyphState = "pending" | "ok" | "error";

const GLYPH: Record<GlyphState, string> = {
	pending: "◌",
	ok: "●",
	error: "●",
};

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

/** `● tool summary` — glyph colored by state, name in toolTitle, summary plain. */
export function headerLine(style: Style, state: GlyphState, name: string, summary: string, width: number): string {
	const glyphColor = state === "error" ? "error" : state === "ok" ? "success" : "dim";
	const glyph = style.fg(glyphColor, GLYPH[state]);
	const title = style.fg("toolTitle", style.bold(name));
	return truncateToWidth(`${glyph} ${title}${summary ? ` ${summary}` : ""}`, width);
}

/** Prefix each line with the dim `│ ` gutter, truncating to width. */
export function gutterLines(style: Style, lines: string[], width: number): string[] {
	const bar = style.fg("dim", "│ ");
	return lines.map((line) => truncateToWidth(bar + truncateToWidth(line, Math.max(1, width - 2)), width, ""));
}

/** `╰ part · part · part`, all dim except the parts' own styling. */
export function closingLine(style: Style, parts: string[], width: number): string {
	const corner = style.fg("dim", "╰ ");
	const dot = style.fg("dim", " · ");
	return truncateToWidth(corner + parts.filter(Boolean).join(dot), width);
}

export interface OutputView {
	shown: string[];
	hidden: number;
}

/**
 * Pick which output lines a collapsed view shows. `keep: "tail"` suits
 * command output where the end matters; `"head"` suits listings.
 */
export function collapseOutput(lines: string[], expanded: boolean, limit: number, keep: "head" | "tail"): OutputView {
	const trimmed = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
	if (expanded || trimmed.length <= limit) return { shown: trimmed, hidden: 0 };
	if (limit === 0) return { shown: [], hidden: trimmed.length };
	const shown = keep === "tail" ? trimmed.slice(-limit) : trimmed.slice(0, limit);
	return { shown, hidden: trimmed.length - limit };
}

/** Color one diff line with the theme's diff tokens. */
export function colorDiffLine(style: Style, line: string): string {
	if (line.startsWith("+") && !line.startsWith("+++")) return style.fg("toolDiffAdded", line);
	if (line.startsWith("-") && !line.startsWith("---")) return style.fg("toolDiffRemoved", line);
	return style.fg("toolDiffContext", line);
}

/**
 * Minimal component: build plain string lines once per width. The TUI
 * renders every component on every frame (each wheel tick included), so
 * an uncached build here is O(session text) per frame — 284 tool results
 * cost ~50ms/frame, visible scroll lag. Theme changes arrive as
 * invalidate(), which drops the cache.
 */
export class Lines {
	private cachedWidth?: number;
	private cachedLines?: string[];
	constructor(private readonly build: (width: number) => string[]) {}
	render(width: number): string[] {
		if (this.cachedLines === undefined || this.cachedWidth !== width) {
			this.cachedLines = this.build(width);
			this.cachedWidth = width;
		}
		return this.cachedLines;
	}
	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}
