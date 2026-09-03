import { describe, expect, it } from "vitest";
import {
	buildFooterLines,
	extensionsLine,
	type FooterFacts,
	formatTokens,
	locationLine,
	sessionLine,
	shortenHome,
} from "../src/footer.ts";
import type { Style } from "../src/gutter.ts";

const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

const facts = (overrides: Partial<FooterFacts> = {}): FooterFacts => ({
	cwd: "/opt/u/projects/kit",
	home: "/opt/u",
	inputTokens: 0,
	outputTokens: 0,
	cacheRead: 0,
	cacheWrite: 0,
	statuses: [],
	...overrides,
});

describe("formatTokens", () => {
	it("scales through k and M", () => {
		expect(formatTokens(999)).toBe("999");
		expect(formatTokens(1234)).toBe("1.2k");
		expect(formatTokens(45_600)).toBe("46k");
		expect(formatTokens(1_200_000)).toBe("1.2M");
	});
});

describe("shortenHome", () => {
	it("replaces the home prefix with ~", () => {
		expect(shortenHome("/opt/u/projects", "/opt/u")).toBe("~/projects");
		expect(shortenHome("/opt/u", "/opt/u")).toBe("~");
		expect(shortenHome("/etc", "/opt/u")).toBe("/etc");
		expect(shortenHome("/opt/utopia", "/opt/u")).toBe("/opt/utopia");
	});
});

describe("locationLine", () => {
	it("shows path, branch glyph, and session name", () => {
		const line = locationLine(facts({ branch: "main", sessionName: "footer work" }), style);
		expect(line).toBe(
			"<muted>~/projects/kit</><dim> · </><accent>⎇</> <muted>main</><dim> · </><dim>session</> <muted>footer work</>",
		);
	});

	it("omits absent values", () => {
		expect(locationLine(facts(), style)).toBe("<muted>~/projects/kit</>");
	});
});

describe("sessionLine", () => {
	it("labels every value", () => {
		const line = sessionLine(
			facts({
				model: "claude-4",
				thinking: "high",
				contextPercent: 12.34,
				contextWindow: 200_000,
				inputTokens: 12_300,
				outputTokens: 3400,
				cacheRead: 1_200_000,
				cacheWrite: 45_600,
				cacheHitRate: 97.6,
				cost: 0.416,
			}),
			style,
		);
		expect(line).toBe(
			"<dim>model</> <text>claude-4</>" +
				"<dim> · </><dim>think</> <text>high</>" +
				"<dim> · </><dim>ctx</> <text>12.3%</> <dim>of 200k</>" +
				"<dim> · </><dim>in</> 12k" +
				"<dim> · </><dim>out</> 3.4k" +
				"<dim> · </><dim>read</> 1.2M" +
				"<dim> · </><dim>write</> 46k" +
				"<dim> · </><dim>hit</> 98%" +
				"<dim> · </><muted>$0.42</>",
		);
	});

	it("colors high context pressure", () => {
		expect(sessionLine(facts({ model: "m", contextPercent: 95, contextWindow: 100 }), style)).toContain(
			"<error>95.0%</>",
		);
		expect(sessionLine(facts({ model: "m", contextPercent: 75, contextWindow: 100 }), style)).toContain(
			"<warning>75.0%</>",
		);
	});

	it("hides thinking when off", () => {
		expect(sessionLine(facts({ model: "m", thinking: "off" }), style)).not.toContain("think");
	});
});

describe("extensionsLine", () => {
	it("labels each status with its extension name", () => {
		const line = extensionsLine(facts({ statuses: [["interlock", "armed"], ["scratchpad", "ready"]] }), style);
		expect(line).toBe("<dim>interlock</> armed<dim> · </><dim>scratchpad</> ready");
	});

	it("shows a placeholder when empty", () => {
		expect(extensionsLine(facts(), style)).toBe("<dim>ext</> <dim>—</>");
	});

	it("strips a status's redundant self-name prefix", () => {
		const line = extensionsLine(
			facts({ statuses: [["interlock", "Interlock: armed"], ["autojournal", "autojournal: syncing… 3s"]] }),
			style,
		);
		expect(line).toBe("<dim>interlock</> armed<dim> · </><dim>autojournal</> syncing… 3s");
	});

	it("keeps a status that is only the extension name", () => {
		expect(extensionsLine(facts({ statuses: [["todo", "todo"]] }), style)).toBe("<dim>todo</> todo");
	});
});

describe("buildFooterLines", () => {
	it("always returns exactly three lines", () => {
		expect(buildFooterLines(facts(), style, 400)).toHaveLength(3);
	});
});
