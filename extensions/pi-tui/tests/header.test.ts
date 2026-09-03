import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { Style } from "../src/gutter.ts";
import { buildHeaderLines, center, estateLine, piGlyph, workspaceLine } from "../src/header.ts";

const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

const plain: Style = { fg: (_c, t) => t, bold: (t) => t } as Style;

describe("piGlyph", () => {
	it("has a solid roof and legs dissolving through shade blocks", () => {
		const rows = piGlyph(plain);
		expect(rows[0]).toBe("██████████████");
		expect(rows[1]).toContain("██");
		expect(rows[2]).toContain("▓▓");
		expect(rows[3]).toContain("▒▒");
		expect(rows[4]).toContain("░░");
		// Legs align column for column
		expect(rows.slice(1).every((row) => visibleWidth(row) === 14)).toBe(true);
	});
});

describe("center", () => {
	it("pads to the middle of the width", () => {
		expect(center("abcd", 10)).toBe("   abcd");
		expect(center("abcd", 4)).toBe("abcd");
	});

	it("never exceeds the width", () => {
		expect(visibleWidth(center("abcdef", 4))).toBeLessThanOrEqual(4);
	});
});

describe("workspaceLine", () => {
	it("shows workspace with branch glyph", () => {
		expect(workspaceLine({ workspace: "kit", branch: "main" }, style)).toBe(
			"<text>kit</> <accent>⎇</> <muted>main</>",
		);
	});

	it("omits the branch when absent", () => {
		expect(workspaceLine({ workspace: "kit" }, style)).toBe("<text>kit</>");
	});
});

describe("estateLine", () => {
	it("labels each count", () => {
		expect(estateLine({ workspace: "kit", skills: 21, extensions: 6, inboxNotes: 3 }, style)).toBe(
			"<dim>skills</> <muted>21</><dim> · </><dim>extensions</> <muted>6</><dim> · </><dim>inbox</> <muted>3</>",
		);
	});

	it("omits missing counts entirely", () => {
		expect(estateLine({ workspace: "kit", skills: 2 }, style)).toBe("<dim>skills</> <muted>2</>");
		expect(estateLine({ workspace: "kit" }, style)).toBe("");
	});
});

describe("buildHeaderLines", () => {
	it("centers glyph and facts within the width", () => {
		const lines = buildHeaderLines({ workspace: "kit", branch: "main", skills: 1 }, plain, 40);
		expect(lines[0]).toBe("");
		expect(lines[1]).toBe(`${" ".repeat(13)}██████████████`);
		expect(lines.at(-1)).toBe("");
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});

	it("drops the estate line when no counts resolved", () => {
		const withCounts = buildHeaderLines({ workspace: "kit", skills: 1 }, plain, 40);
		const without = buildHeaderLines({ workspace: "kit" }, plain, 40);
		expect(without.length).toBe(withCounts.length - 1);
	});
});
