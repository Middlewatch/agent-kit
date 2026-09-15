/**
 * Progress widget above the editor, derived from the assistant's own
 * replies: markdown task-list lines become items keyed by their text, so
 * the agent's progress prose and the widget cannot drift apart and no tool
 * call or tool schema is involved. State rebuilds from the session branch.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Style } from "./gutter.ts";

export type ProgressStatus = "open" | "done" | "skip";

export interface ProgressItem {
	text: string;
	status: ProgressStatus;
	reason?: string;
}

const WIDGET_KEY = "pitui-progress";
const MAX_ITEMS = 4;
/** `- [ ] text`, `* [x] text`, `3. [-] text`; the mark decides the status. */
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX\-~])\]\s+(.*\S)\s*$/;
const SKIP_AT = /skip:/i;

function parseLine(line: string): ProgressItem | undefined {
	const match = TASK_LINE.exec(line);
	if (!match) return undefined;
	const mark = match[1];
	const text = match[2];
	if (mark === " ") return { text, status: "open" };
	if (mark === "x" || mark === "X") return { text, status: "done" };
	const at = text.search(SKIP_AT);
	if (at === -1) return { text, status: "skip" };
	const reason = text
		.slice(at + "skip:".length)
		.trim()
		.replace(/[)\]]\s*$/, "")
		.trim();
	const head = text
		.slice(0, at)
		.replace(/[\s(\[—:-]+$/, "")
		.trim();
	return { text: head || text, status: "skip", reason: reason || undefined };
}

export function parseTaskLines(text: string): ProgressItem[] {
	return text
		.split("\n")
		.map(parseLine)
		.filter((item): item is ProgressItem => item !== undefined);
}

const keyOf = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Same text updates the existing item in place; new text appends in order. */
export function applyItems(items: ProgressItem[], parsed: ProgressItem[]): ProgressItem[] {
	const next = items.map((item) => ({ ...item }));
	for (const item of parsed) {
		const key = keyOf(item.text);
		const index = next.findIndex((existing) => keyOf(existing.text) === key);
		if (index === -1) next.push({ ...item });
		else next[index] = { ...item };
	}
	return next;
}

export const allSettled = (items: ProgressItem[]): boolean => items.every((item) => item.status !== "open");

/**
 * Done and reasoned skips collapse into the count; the list shows open
 * items, then skips with no reason so the missing reason stays visible.
 */
export function buildProgressWidgetLines(items: ProgressItem[], style: Style, width: number): string[] {
	if (items.length === 0) return [];

	const done = items.filter((item) => item.status === "done").length;
	const skipped = items.filter((item) => item.status === "skip");
	const unreasoned = skipped.filter((item) => !item.reason);
	const parts = [`${done}/${items.length} done`];
	if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
	let header = `${style.fg("dim", "progress")} ${style.fg("muted", parts.join(", "))}`;
	if (unreasoned.length > 0) header += ` ${style.fg("warning", `${unreasoned.length} without reason`)}`;
	const lines = [header];

	const shown = [
		...items.filter((item) => item.status === "open").map((item) => `${style.fg("accent", "○")} ${style.fg("text", item.text)}`),
		...unreasoned.map((item) => `${style.fg("warning", "⊘")} ${style.fg("muted", item.text)}`),
	];
	lines.push(...shown.slice(0, MAX_ITEMS));
	if (shown.length > MAX_ITEMS) lines.push(style.fg("dim", `… ${shown.length - MAX_ITEMS} more`));
	return lines.map((line) => truncateToWidth(line, width));
}

interface MessageLike {
	role: string;
	content?: unknown;
}

function textOf(message: MessageLike): string {
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: "text"; text: string } => !!part && part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

export function registerProgressWidget(pi: ExtensionAPI): void {
	let items: ProgressItem[] = [];

	// A user message after everything settled starts a fresh list; an
	// unfinished list survives the turn boundary so a continuation keeps it.
	const absorb = (message: MessageLike): void => {
		if (message.role === "user") {
			if (items.length > 0 && allSettled(items)) items = [];
			return;
		}
		if (message.role !== "assistant") return;
		const parsed = parseTaskLines(textOf(message));
		if (parsed.length > 0) items = applyItems(items, parsed);
	};

	const reconstruct = (ctx: ExtensionContext): void => {
		items = [];
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			absorb(entry.message as MessageLike);
		}
	};

	const apply = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui") return;
		if (items.length === 0) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		const snapshot = items;
		ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				return buildProgressWidgetLines(snapshot, theme, width);
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

	pi.on("message_end", async (event, ctx) => {
		absorb(event.message as MessageLike);
		apply(ctx);
	});
}
