import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
	closingLine,
	collapseOutput,
	colorDiffLine,
	formatDuration,
	gutterLines,
	headerLine,
	Lines,
	type Style,
} from "../src/gutter.ts";

/** Tagging fake: styling is visible in assertions, widths stay plain. */
const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

describe("formatDuration", () => {
	it("uses ms under a second, seconds under a minute, then minutes", () => {
		expect(formatDuration(340)).toBe("340ms");
		expect(formatDuration(1234)).toBe("1.2s");
		expect(formatDuration(72_500)).toBe("1m 13s");
	});
});

describe("headerLine", () => {
	it("colors the glyph by state and bolds the tool name", () => {
		expect(headerLine(style, "ok", "bash", "git status", 80)).toBe("<success>●</> <toolTitle><b>bash</b></> git status");
		expect(headerLine(style, "pending", "read", "a.ts", 80)).toBe("<dim>◌</> <toolTitle><b>read</b></> a.ts");
		expect(headerLine(style, "error", "bash", "false", 80)).toBe("<error>●</> <toolTitle><b>bash</b></> false");
	});

	it("omits the summary separator when the summary is empty", () => {
		expect(headerLine(style, "ok", "ls", "", 80)).toBe("<success>●</> <toolTitle><b>ls</b></>");
	});
});

describe("gutterLines", () => {
	it("prefixes every line with a dim bar", () => {
		expect(gutterLines(style, ["one", "two"], 80)).toEqual(["<dim>│ </>one", "<dim>│ </>two"]);
	});

	it("truncates each line so gutter plus content fit the width", () => {
		const plain: Style = { fg: (_c, t) => t, bold: (t) => t } as Style;
		const [line] = gutterLines(plain, ["abcdefghij"], 8);
		expect(line.startsWith("│ abc")).toBe(true);
		expect(visibleWidth(line as string)).toBeLessThanOrEqual(8);
	});
});

describe("closingLine", () => {
	it("joins parts with dim separators behind the corner", () => {
		expect(closingLine(style, ["<success>ok</>", "1.2s"], 80)).toBe("<dim>╰ </><success>ok</><dim> · </>1.2s");
	});

	it("drops empty parts", () => {
		expect(closingLine(style, ["ok", "", "3 lines hidden"], 80)).toBe("<dim>╰ </>ok<dim> · </>3 lines hidden");
	});
});

describe("collapseOutput", () => {
	const lines = ["1", "2", "3", "4", "5"];

	it("shows everything when expanded or under the limit", () => {
		expect(collapseOutput(lines, true, 2, "head")).toEqual({ shown: lines, hidden: 0 });
		expect(collapseOutput(lines, false, 5, "head")).toEqual({ shown: lines, hidden: 0 });
	});

	it("keeps the head or tail when collapsed", () => {
		expect(collapseOutput(lines, false, 2, "head")).toEqual({ shown: ["1", "2"], hidden: 3 });
		expect(collapseOutput(lines, false, 2, "tail")).toEqual({ shown: ["4", "5"], hidden: 3 });
	});

	it("hides everything at limit zero", () => {
		expect(collapseOutput(lines, false, 0, "head")).toEqual({ shown: [], hidden: 5 });
	});

	it("drops one trailing blank line before counting", () => {
		expect(collapseOutput(["a", ""], false, 6, "head")).toEqual({ shown: ["a"], hidden: 0 });
	});
});

describe("colorDiffLine", () => {
	it("maps +/-/context to the diff tokens, sparing file headers", () => {
		expect(colorDiffLine(style, "+new")).toBe("<toolDiffAdded>+new</>");
		expect(colorDiffLine(style, "-old")).toBe("<toolDiffRemoved>-old</>");
		expect(colorDiffLine(style, " same")).toBe("<toolDiffContext> same</>");
		expect(colorDiffLine(style, "+++ b/file")).toBe("<toolDiffContext>+++ b/file</>");
	});
});

describe("Lines", () => {
	it("caches by width: repeated renders at one width build once", () => {
		let builds = 0;
		const lines = new Lines((width) => {
			builds += 1;
			return [`w${width}`];
		});
		expect(lines.render(80)).toEqual(["w80"]);
		expect(lines.render(80)).toEqual(["w80"]);
		expect(builds).toBe(1);
		expect(lines.render(100)).toEqual(["w100"]);
		expect(builds).toBe(2);
	});

	it("invalidate clears the cache so theme changes repaint", () => {
		let builds = 0;
		const lines = new Lines(() => {
			builds += 1;
			return ["x"];
		});
		lines.render(80);
		lines.invalidate();
		lines.render(80);
		expect(builds).toBe(2);
	});
});
