/**
 * Todo — a session step list with a visible skip state.
 *
 * Built for router-style workflows (evoker-mode's playbook contract): copy a
 * playbook's numbered steps in verbatim with `set`, then mark each one
 * active/done/skip as work proceeds. A skip requires a reason; the tool
 * rejects one without it. Useful as a plain task list too.
 *
 * State lives in tool result details, so branching a session reconstructs
 * the list correctly for that point in history (same pattern as pi's
 * examples/extensions/todo.ts, which seeded this file).
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type TodoStatus = "pending" | "active" | "done" | "skip";

interface TodoItem {
	id: number;
	text: string;
	status: TodoStatus;
	reason?: string;
}

interface TodoDetails {
	action: "set" | "add" | "status" | "list" | "clear";
	todos: TodoItem[];
	nextId: number;
	error?: string;
}

const TodoParams = Type.Object({
	action: StringEnum(["set", "add", "status", "list", "clear"] as const),
	items: Type.Optional(
		Type.Array(Type.String(), {
			description: "Step texts in order. set replaces the whole list; add appends.",
		}),
	),
	id: Type.Optional(Type.Number({ description: "Todo ID (for status)" })),
	status: Type.Optional(StringEnum(["pending", "active", "done", "skip"] as const)),
	reason: Type.Optional(Type.String({ description: "One-line reason, required when status is skip" })),
});

const STATUS_ICON: Record<TodoStatus, { icon: string; color: ThemeColor }> = {
	pending: { icon: "○", color: "dim" },
	active: { icon: "→", color: "accent" },
	done: { icon: "✓", color: "success" },
	skip: { icon: "⊘", color: "warning" },
};

function renderItemLine(t: TodoItem, theme: Theme): string {
	const { icon, color } = STATUS_ICON[t.status];
	const mark = theme.fg(color, icon);
	const id = theme.fg("accent", `#${t.id}`);
	const text = t.status === "done" || t.status === "skip" ? theme.fg("dim", t.text) : theme.fg("text", t.text);
	const reason = t.status === "skip" && t.reason ? theme.fg("dim", ` — skip: ${t.reason}`) : "";
	return `${mark} ${id} ${text}${reason}`;
}

function plainList(todos: TodoItem[]): string {
	if (todos.length === 0) return "No todos";
	return todos
		.map((t) => {
			const mark = t.status === "done" ? "x" : t.status === "skip" ? "-" : t.status === "active" ? ">" : " ";
			const reason = t.status === "skip" && t.reason ? ` (skip: ${t.reason})` : "";
			return `[${mark}] #${t.id}: ${t.text}${reason}`;
		})
		.join("\n");
}

/** Full-screen viewer for the /todos command. */
class TodoListComponent {
	private todos: TodoItem[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(todos: TodoItem[], theme: Theme, onClose: () => void) {
		this.todos = todos;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Todos ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.todos.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No todos on this branch.")}`, width));
		} else {
			const done = this.todos.filter((t) => t.status === "done").length;
			const skipped = this.todos.filter((t) => t.status === "skip").length;
			const summary = skipped > 0 ? `${done}/${this.todos.length} done, ${skipped} skipped` : `${done}/${this.todos.length} done`;
			lines.push(truncateToWidth(`  ${th.fg("muted", summary)}`, width));
			lines.push("");
			for (const t of this.todos) {
				lines.push(truncateToWidth(`  ${renderItemLine(t, th)}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function (pi: ExtensionAPI) {
	let todos: TodoItem[] = [];
	let nextId = 1;

	/** Replay tool results on the current branch so branching stays correct. */
	const reconstructState = (ctx: ExtensionContext) => {
		todos = [];
		nextId = 1;

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;

			const details = msg.details as TodoDetails | undefined;
			if (details && !details.error) {
				todos = details.todos;
				nextId = details.nextId;
			}
		}
	};

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	const ok = (action: TodoDetails["action"], text: string) => ({
		content: [{ type: "text" as const, text }],
		details: { action, todos: todos.map((t) => ({ ...t })), nextId } as TodoDetails,
	});

	const fail = (action: TodoDetails["action"], error: string) => ({
		content: [{ type: "text" as const, text: `Error: ${error}` }],
		details: { action, todos: todos.map((t) => ({ ...t })), nextId, error } as TodoDetails,
	});

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			"Session step list. Actions: set (replace the list with items, in order), add (append items), " +
			"status (mark one item pending/active/done/skip by id; skip requires a reason), list, clear. " +
			"When following a playbook or plan with numbered steps, set them verbatim before starting and " +
			"update each step's status as you go.",
		promptSnippet: "Track ordered task steps; skipping a step records a visible reason",
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "set": {
					const items = params.items ?? [];
					todos = items.map((text, i) => ({ id: i + 1, text, status: "pending" as TodoStatus }));
					nextId = todos.length + 1;
					return ok("set", todos.length ? `Set ${todos.length} todos:\n${plainList(todos)}` : "Cleared todos (set with no items)");
				}

				case "add": {
					const items = params.items ?? [];
					if (items.length === 0) return fail("add", "items required for add");
					for (const text of items) {
						todos.push({ id: nextId++, text, status: "pending" });
					}
					return ok("add", `Added ${items.length} todo(s):\n${plainList(todos)}`);
				}

				case "status": {
					if (params.id === undefined) return fail("status", "id required for status");
					if (params.status === undefined) return fail("status", "status required");
					const todo = todos.find((t) => t.id === params.id);
					if (!todo) return fail("status", `#${params.id} not found`);
					if (params.status === "skip" && !params.reason?.trim()) {
						return fail("status", `skip requires a reason; give the one-line reason for skipping #${params.id}`);
					}
					todo.status = params.status as TodoStatus;
					todo.reason = params.status === "skip" ? params.reason?.trim() : undefined;
					const suffix = todo.status === "skip" ? ` (${todo.reason})` : "";
					return ok("status", `#${todo.id} ${todo.status}${suffix}`);
				}

				case "list":
					return ok("list", plainList(todos));

				case "clear": {
					const count = todos.length;
					todos = [];
					nextId = 1;
					return ok("clear", `Cleared ${count} todos`);
				}

				default:
					return fail("list", `unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
			if (args.items?.length) text += ` ${theme.fg("dim", `(${args.items.length} items)`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			if (args.status) text += ` ${theme.fg("muted", args.status)}`;
			if (args.reason) text += ` ${theme.fg("dim", `"${args.reason}"`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TodoDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			const list = details.todos;
			if (list.length === 0) {
				return new Text(theme.fg("dim", "No todos"), 0, 0);
			}

			const done = list.filter((t) => t.status === "done").length;
			const skipped = list.filter((t) => t.status === "skip").length;
			let header = theme.fg("muted", `${done}/${list.length} done`);
			if (skipped > 0) header += theme.fg("dim", `, ${skipped} skipped`);

			const display = expanded ? list : list.slice(0, 8);
			let out = header;
			for (const t of display) {
				out += `\n${renderItemLine(t, theme)}`;
			}
			if (!expanded && list.length > 8) {
				out += `\n${theme.fg("dim", `... ${list.length - 8} more`)}`;
			}
			return new Text(out, 0, 0);
		},
	});

	pi.registerCommand("todos", {
		description: "Show the todo list for the current branch",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify(plainList(todos), "info");
				return;
			}
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TodoListComponent(todos, theme, () => done());
			});
		},
	});
}
