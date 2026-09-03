/**
 * Glanceable todo widget above the editor. State comes from the todo
 * tool's result details (the same contract that extension uses to
 * rebuild after branching), so there is no coupling beyond the details
 * shape: { todos, nextId, error? }.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Style } from "./gutter.ts";

export interface TodoItem {
	id: number;
	text: string;
	status: "pending" | "active" | "done" | "skip";
	reason?: string;
}

interface TodoDetails {
	todos?: TodoItem[];
	error?: string;
}

const WIDGET_KEY = "pitui-todo";
const MAX_ITEMS = 4;

const ICON: Record<TodoItem["status"], { glyph: string; color: "dim" | "accent" | "success" | "warning" }> = {
	pending: { glyph: "○", color: "dim" },
	active: { glyph: "→", color: "accent" },
	done: { glyph: "✓", color: "success" },
	skip: { glyph: "⊘", color: "warning" },
};

/**
 * Done and skipped items collapse into the count; the list shows the
 * active item and the next pendings.
 */
export function buildTodoWidgetLines(todos: TodoItem[], style: Style, width: number): string[] {
	if (todos.length === 0) return [];

	const done = todos.filter((t) => t.status === "done").length;
	const skipped = todos.filter((t) => t.status === "skip").length;
	const settled = skipped > 0 ? `${done}/${todos.length} done, ${skipped} skipped` : `${done}/${todos.length} done`;
	const lines = [`${style.fg("dim", "todo")} ${style.fg("muted", settled)}`];

	const open = todos.filter((t) => t.status === "active" || t.status === "pending");
	for (const item of open.slice(0, MAX_ITEMS)) {
		const icon = ICON[item.status];
		const text = item.status === "active" ? style.fg("text", item.text) : style.fg("muted", item.text);
		lines.push(`${style.fg(icon.color, icon.glyph)} ${style.fg("dim", `#${item.id}`)} ${text}`);
	}
	if (open.length > MAX_ITEMS) {
		lines.push(style.fg("dim", `… ${open.length - MAX_ITEMS} more`));
	}
	return lines.map((line) => truncateToWidth(line, width));
}

export function registerTodoWidget(pi: ExtensionAPI): void {
	let todos: TodoItem[] = [];

	const reconstruct = (ctx: ExtensionContext) => {
		todos = [];
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const message = entry.message as { role: string; toolName?: string; details?: TodoDetails };
			if (message.role !== "toolResult" || message.toolName !== "todo") continue;
			if (message.details?.todos && !message.details.error) todos = message.details.todos;
		}
	};

	const apply = (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;
		if (todos.length === 0) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		const snapshot = todos;
		ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				return buildTodoWidgetLines(snapshot, theme, width);
			},
		}));
	};

	pi.on("session_start", async (_event, ctx) => {
		reconstruct(ctx);
		apply(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		reconstruct(ctx);
		apply(ctx);
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "todo") return;
		const details = event.details as TodoDetails | undefined;
		if (details?.todos && !details.error) {
			todos = details.todos;
			apply(ctx);
		}
	});
}
