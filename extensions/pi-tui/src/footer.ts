/**
 * Three labeled footer lines replacing the stock cluster:
 *
 *   ~/projects/agent-kit ⎇ main · fix-footer
 *   model claude-4.5 · think high · ctx 12.3% of 200k · in 12k · out 3k · hit 98% · $0.42
 *   interlock armed · scratchpad ready
 *
 * Stock semantics carried over: ↑/↓ were input/output totals, R/W cache
 * read/write totals, CH the latest response's cache-hit rate.
 */
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Style } from "./gutter.ts";

export interface FooterFacts {
	cwd: string;
	home?: string;
	branch?: string;
	sessionName?: string;
	model?: string;
	thinking?: string;
	contextPercent?: number;
	contextWindow?: number;
	inputTokens: number;
	outputTokens: number;
	cacheRead: number;
	cacheWrite: number;
	cacheHitRate?: number;
	cost?: number;
	statuses: Array<[name: string, text: string]>;
}

export function formatTokens(count: number): string {
	if (count < 1000) return `${count}`;
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

export function shortenHome(cwd: string, home?: string): string {
	if (!home || home === "") return cwd;
	if (cwd === home) return "~";
	return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}

const SEP = (style: Style) => style.fg("dim", " · ");
const label = (style: Style, name: string, value: string) => `${style.fg("dim", name)} ${value}`;

export function locationLine(facts: FooterFacts, style: Style): string {
	const parts = [style.fg("muted", shortenHome(facts.cwd, facts.home))];
	if (facts.branch) parts.push(`${style.fg("accent", "⎇")} ${style.fg("muted", facts.branch)}`);
	if (facts.sessionName) parts.push(label(style, "session", style.fg("muted", facts.sessionName)));
	return parts.join(SEP(style));
}

export function sessionLine(facts: FooterFacts, style: Style): string {
	const parts: string[] = [];
	parts.push(label(style, "model", style.fg("text", facts.model ?? "none")));
	if (facts.thinking && facts.thinking !== "off") parts.push(label(style, "think", style.fg("text", facts.thinking)));
	if (facts.contextPercent !== undefined && facts.contextWindow) {
		const pct = `${facts.contextPercent.toFixed(1)}%`;
		const colored =
			facts.contextPercent > 90
				? style.fg("error", pct)
				: facts.contextPercent > 70
					? style.fg("warning", pct)
					: style.fg("text", pct);
		parts.push(label(style, "ctx", `${colored} ${style.fg("dim", `of ${formatTokens(facts.contextWindow)}`)}`));
	}
	if (facts.inputTokens) parts.push(label(style, "in", formatTokens(facts.inputTokens)));
	if (facts.outputTokens) parts.push(label(style, "out", formatTokens(facts.outputTokens)));
	if (facts.cacheRead) parts.push(label(style, "read", formatTokens(facts.cacheRead)));
	if (facts.cacheWrite) parts.push(label(style, "write", formatTokens(facts.cacheWrite)));
	if (facts.cacheHitRate !== undefined) parts.push(label(style, "hit", `${facts.cacheHitRate.toFixed(0)}%`));
	if (facts.cost) parts.push(style.fg("muted", `$${facts.cost.toFixed(2)}`));
	return parts.join(SEP(style));
}

/**
 * The footer already labels each status with its extension key, so a
 * status that names its own extension ("Interlock: armed") sheds the
 * redundant prefix.
 */
export function stripSelfName(name: string, text: string): string {
	if (!text.toLowerCase().startsWith(name.toLowerCase())) return text;
	const stripped = text.slice(name.length).replace(/^[:\s]+/, "");
	return stripped === "" ? text : stripped;
}

export function extensionsLine(facts: FooterFacts, style: Style): string {
	if (facts.statuses.length === 0) return label(style, "ext", style.fg("dim", "—"));
	return facts.statuses.map(([name, text]) => label(style, name, stripSelfName(name, text))).join(SEP(style));
}

export function buildFooterLines(facts: FooterFacts, style: Style, width: number): string[] {
	return [locationLine(facts, style), sessionLine(facts, style), extensionsLine(facts, style)].map((line) =>
		truncateToWidth(line, width),
	);
}
