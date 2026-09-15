import { describe, expect, it } from "vitest";
import type { Style } from "../src/gutter.ts";
import {
	allSettled,
	applyItems,
	buildProgressWidgetLines,
	parseTaskLines,
	type ProgressItem,
} from "../src/progress-widget.ts";

const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

describe("parseTaskLines", () => {
	it("reads bullet and numbered task lines and ignores the rest", () => {
		const text = [
			"Starting the sweep.",
			"- [ ] Gather usage counts",
			"* [x] Read the tool sources",
			"2. [X] Spot-check two rows",
			"- not a task",
			"[ ] no bullet",
		].join("\n");
		expect(parseTaskLines(text)).toEqual([
			{ text: "Gather usage counts", status: "open" },
			{ text: "Read the tool sources", status: "done" },
			{ text: "Spot-check two rows", status: "done" },
		]);
	});

	it("splits a skip into text and reason, in either wrapping", () => {
		expect(parseTaskLines("- [-] Run the suite (skip: no toolchain)")).toEqual([
			{ text: "Run the suite", status: "skip", reason: "no toolchain" },
		]);
		expect(parseTaskLines("- [~] Run the suite — skip: no toolchain")).toEqual([
			{ text: "Run the suite", status: "skip", reason: "no toolchain" },
		]);
		expect(parseTaskLines("- [-] Run the suite")).toEqual([{ text: "Run the suite", status: "skip" }]);
	});
});

describe("applyItems", () => {
	it("updates by text, case and spacing insensitive, and appends new items in order", () => {
		const items = applyItems([], parseTaskLines("- [ ] Gather counts\n- [ ] Read sources"));
		const next = applyItems(items, parseTaskLines("- [x] gather  counts\n- [ ] Write it up"));
		expect(next).toEqual([
			{ text: "gather  counts", status: "done" },
			{ text: "Read sources", status: "open" },
			{ text: "Write it up", status: "open" },
		]);
		expect(allSettled(next)).toBe(false);
	});

	it("reopens a settled item when its text appears open again", () => {
		const items: ProgressItem[] = [{ text: "Run gates", status: "done" }];
		expect(applyItems(items, parseTaskLines("- [ ] Run gates"))).toEqual([{ text: "Run gates", status: "open" }]);
	});
});

describe("buildProgressWidgetLines", () => {
	it("returns nothing for an empty list", () => {
		expect(buildProgressWidgetLines([], style, 400)).toEqual([]);
	});

	it("summarizes settled items and lists the open ones", () => {
		const items: ProgressItem[] = [
			{ text: "a", status: "done" },
			{ text: "b", status: "open" },
			{ text: "c", status: "skip", reason: "not needed" },
		];
		expect(buildProgressWidgetLines(items, style, 400)).toEqual([
			"<dim>progress</> <muted>1/3 done, 1 skipped</>",
			"<accent>○</> <text>b</>",
		]);
	});

	it("flags and lists a skip with no reason", () => {
		const items: ProgressItem[] = [
			{ text: "a", status: "done" },
			{ text: "b", status: "skip" },
		];
		expect(buildProgressWidgetLines(items, style, 400)).toEqual([
			"<dim>progress</> <muted>1/2 done, 1 skipped</> <warning>1 without reason</>",
			"<warning>⊘</> <muted>b</>",
		]);
		expect(allSettled(items)).toBe(true);
	});

	it("caps the list at four and counts the rest", () => {
		const items: ProgressItem[] = ["a", "b", "c", "d", "e", "f"].map((text) => ({ text, status: "open" as const }));
		const lines = buildProgressWidgetLines(items, style, 400);
		expect(lines).toHaveLength(6);
		expect(lines.at(-1)).toBe("<dim>… 2 more</>");
	});
});
