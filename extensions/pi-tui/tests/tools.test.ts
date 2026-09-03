import { describe, expect, it } from "vitest";
import type { Style } from "../src/gutter.ts";
import { resultLines, SPECS, type GutterToolSpec, type ResultView } from "../src/tools.ts";

const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

const spec = (name: string): GutterToolSpec => {
	const found = SPECS.find((s) => s.name === name);
	if (!found) throw new Error(`no spec for ${name}`);
	return found;
};

const textResult = (text: string, details: unknown = {}) => ({
	content: [{ type: "text" as const, text }],
	details,
});

const view = (overrides: Partial<ResultView> = {}): ResultView => ({
	isError: false,
	isPartial: false,
	expanded: false,
	truncated: false,
	...overrides,
});

describe("bash result", () => {
	it("keeps the output tail and closes with ok, duration, hidden count", () => {
		const result = textResult(["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"].join("\n"));
		const lines = resultLines(spec("bash"), result, view({ durationMs: 420 }), style, 400);
		expect(lines).toEqual([
			"<dim>│ </><muted>l3</>",
			"<dim>│ </><muted>l4</>",
			"<dim>│ </><muted>l5</>",
			"<dim>│ </><muted>l6</>",
			"<dim>│ </><muted>l7</>",
			"<dim>│ </><muted>l8</>",
			"<dim>╰ </><success>ok</><dim> · </><dim>420ms</><dim> · </><dim>2 lines hidden</>",
		]);
	});

	it("shows error output in error color with an error close", () => {
		const lines = resultLines(spec("bash"), textResult("boom"), view({ isError: true }), style, 80);
		expect(lines).toEqual(["<dim>│ </><error>boom</>", "<dim>╰ </><error>error</>"]);
	});

	it("omits the closing line while partial", () => {
		const lines = resultLines(spec("bash"), textResult("running"), view({ isPartial: true }), style, 80);
		expect(lines).toEqual(["<dim>│ </><muted>running</>"]);
	});
});

describe("read result", () => {
	it("collapses to just a closing line with the line count", () => {
		const result = textResult("a\nb\nc", { truncation: { truncated: false, totalLines: 3 } });
		const lines = resultLines(spec("read"), result, view({ durationMs: 12 }), style, 400);
		expect(lines).toEqual([
			"<dim>╰ </><success>ok</><dim> · </><dim>3 lines</><dim> · </><dim>12ms</><dim> · </><dim>3 lines hidden</>",
		]);
	});

	it("flags truncation", () => {
		const result = textResult("a", { truncation: { truncated: true, totalLines: 5000 } });
		const lines = resultLines(spec("read"), result, view({ truncated: true }), style, 400);
		expect(lines.at(-1)).toContain("<warning>truncated</>");
	});
});

describe("edit result", () => {
	it("renders the diff with diff colors and a diffstat close", () => {
		const diff = " ctx\n-old line\n+new line";
		const result = textResult("ok", { diff });
		const lines = resultLines(spec("edit"), result, view(), style, 400);
		expect(lines).toEqual([
			"<dim>│ </><toolDiffContext> ctx</>",
			"<dim>│ </><toolDiffRemoved>-old line</>",
			"<dim>│ </><toolDiffAdded>+new line</>",
			"<dim>╰ </><success>ok</><dim> · </><toolDiffAdded>+1</> <toolDiffRemoved>-1</>",
		]);
	});
});

describe("summaries", () => {
	it("bash shows only the first command line", () => {
		expect(spec("bash").summary({ command: "a\nb\nc" }, style)).toBe("a …");
	});

	it("read shows the range dim", () => {
		expect(spec("read").summary({ path: "src/x.ts", offset: 10, limit: 20 }, style)).toBe(
			"src/x.ts <dim>(from 10, 20 lines)</>",
		);
	});

	it("grep shows pattern with qualifiers", () => {
		expect(spec("grep").summary({ pattern: "TODO", glob: "*.ts", ignoreCase: true }, style)).toBe(
			"TODO <dim>(glob *.ts, -i)</>",
		);
	});

	it("covers every built-in the spec names", () => {
		expect(SPECS.map((s) => s.name).sort()).toEqual(["bash", "edit", "find", "grep", "ls", "read", "write"]);
	});
});
