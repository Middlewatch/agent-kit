import { describe, expect, it } from "vitest";
import type { Style } from "../src/gutter.ts";
import { buildTodoWidgetLines, type TodoItem } from "../src/todo-widget.ts";

const style: Style = {
	fg: (color, text) => `<${color}>${text}</>`,
	bold: (text) => `<b>${text}</b>`,
} as Style;

const item = (id: number, status: TodoItem["status"], text = `task ${id}`): TodoItem => ({ id, status, text });

describe("buildTodoWidgetLines", () => {
	it("returns nothing for an empty list", () => {
		expect(buildTodoWidgetLines([], style, 400)).toEqual([]);
	});

	it("summarizes settled items and lists the open ones", () => {
		const todos = [item(1, "done"), item(2, "active"), item(3, "pending")];
		expect(buildTodoWidgetLines(todos, style, 400)).toEqual([
			"<dim>todo</> <muted>1/3 done</>",
			"<accent>→</> <dim>#2</> <text>task 2</>",
			"<dim>○</> <dim>#3</> <muted>task 3</>",
		]);
	});

	it("counts skips in the summary", () => {
		const todos = [item(1, "skip"), item(2, "done"), item(3, "pending")];
		const [summary] = buildTodoWidgetLines(todos, style, 400);
		expect(summary).toBe("<dim>todo</> <muted>1/3 done, 1 skipped</>");
	});

	it("caps open items and reports the overflow", () => {
		const todos = [item(1, "active"), ...[2, 3, 4, 5, 6, 7].map((id) => item(id, "pending"))];
		const lines = buildTodoWidgetLines(todos, style, 400);
		expect(lines).toHaveLength(1 + 4 + 1);
		expect(lines.at(-1)).toBe("<dim>… 3 more</>");
	});

	it("shows only the summary when everything is settled", () => {
		const todos = [item(1, "done"), item(2, "done")];
		expect(buildTodoWidgetLines(todos, style, 400)).toEqual(["<dim>todo</> <muted>2/2 done</>"]);
	});
});
