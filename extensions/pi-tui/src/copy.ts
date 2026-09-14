/**
 * Transcript-backed copy for fullscreen mode.
 *
 * pi's drag-select slices the rendered scroll content, so copied code
 * carries the message margin and the markdown code-block indent, and long
 * lines arrive hard-wrapped. This layer maps the selected rows back to the
 * components that painted them and returns their source where it knows the
 * rendering: fenced code blocks come from the Markdown component's text
 * (wrapped rows rejoined, tabs kept), prose loses its margin, and gutter
 * tool output loses the `│ ` bar. Every other row is pi's rendered slice.
 */
import { sliceByColumn, stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Lines } from "./gutter.ts";

export interface SelectionPoint {
	row: number;
	col: number;
	/** When set, `col` is exclusive (pi sets it for line-granularity selections). */
	boundary?: boolean;
}

export interface SelectionRange {
	start: SelectionPoint;
	end: SelectionPoint;
}

/** The slice of a component this module reads; every field but `render` is optional. */
interface Renderable {
	render(width: number): string[];
	children?: Renderable[];
	paddingX?: number;
	paddingY?: number;
	text?: string;
	theme?: { codeBlock?: unknown; codeBlockIndent?: string };
	options?: { transform?: (markdown: string, width: number) => string };
}

interface Leaf {
	component: Renderable;
	rowStart: number;
	lines: string[];
	/** Columns the enclosing Box padding adds to the left of this leaf's lines. */
	colOffset: number;
	width: number;
}

const plain = (line: string): string => stripTerminalSequences(line).trimEnd();

const isMarkdown = (component: Renderable): boolean =>
	typeof component.text === "string" &&
	typeof component.paddingX === "number" &&
	typeof component.theme?.codeBlock === "function";

/** First offset at or after `from` where `child` appears verbatim inside `parent`. */
function locate(parent: string[], child: string[], from: number): number | undefined {
	for (let offset = from; offset + child.length <= parent.length; offset++) {
		if (child.every((line, index) => parent[offset + index] === line)) return offset;
	}
	return undefined;
}

/**
 * Walk the component tree the way `Container` and `Box` lay children out,
 * collecting the leaves whose rows intersect `[firstRow, lastRow]`. Each
 * child is located by content inside its parent's rendered lines, starting
 * from the stacked position, so a parent that prepends rows (pi's tool
 * component adds a blank row in self-shell mode) still resolves.
 */
function collectLeaves(
	component: Renderable,
	width: number,
	rowStart: number,
	colOffset: number,
	firstRow: number,
	lastRow: number,
	out: Leaf[],
): void {
	const children = component.children;
	if (!Array.isArray(children) || isMarkdown(component)) {
		out.push({ component, rowStart, lines: component.render(width), colOffset, width });
		return;
	}
	const isBox = typeof component.paddingX === "number" && typeof component.paddingY === "number";
	const pad = isBox ? (component.paddingX ?? 0) : 0;
	const childWidth = Math.max(1, width - pad * 2);
	const parentLines = component.render(width).map(plain);
	let cursor = isBox ? (component.paddingY ?? 0) : 0;
	for (const child of children) {
		const lines = child.render(childWidth);
		if (lines.length === 0) continue;
		const offset = locate(
			parentLines,
			lines.map((line) => (" ".repeat(pad) + plain(line)).trimEnd()),
			cursor,
		);
		if (offset === undefined) return; // this parent paints its children some other way
		const row = rowStart + offset;
		if (row + lines.length > firstRow && row <= lastRow) {
			collectLeaves(child, childWidth, row, colOffset + pad, firstRow, lastRow, out);
		}
		cursor = offset + lines.length;
	}
}

interface CodeRow {
	/** Index into the source lines of the block's markdown. */
	line: number;
	/** The source line as written (tabs intact). */
	source: string;
	/** Rows this source line occupies after wrapping. */
	rows: number;
	/** Columns before the code on this row: margin plus indent on the first row, margin after. */
	prefix: number;
}

interface FenceBlock {
	lang: string;
	lines: string[];
	normalized: string[];
}

const OPENING_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** Top-level fenced blocks in markdown source, the way marked lexes them. */
export function fencedBlocks(source: string, normalized: string): FenceBlock[] {
	const sourceLines = source.split(/\r?\n/);
	const normalizedLines = normalized.split(/\r?\n/);
	const blocks: FenceBlock[] = [];
	let index = 0;
	while (index < normalizedLines.length) {
		const open = OPENING_FENCE.exec(normalizedLines[index]);
		if (!open) {
			index++;
			continue;
		}
		const indent = open[1].length;
		const fence = open[2];
		const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
		const block: FenceBlock = { lang: open[3].trim(), lines: [], normalized: [] };
		let cursor = index + 1;
		while (cursor < normalizedLines.length && !closing.test(normalizedLines[cursor])) {
			// marked drops up to the opening fence's indentation from each content line.
			const strip = (line: string) => line.replace(new RegExp(`^ {0,${indent}}`), "");
			block.lines.push(strip(sourceLines[cursor] ?? ""));
			block.normalized.push(strip(normalizedLines[cursor]));
			cursor++;
		}
		if (cursor >= normalizedLines.length) break; // unterminated: streaming or a stray fence
		blocks.push(block);
		index = cursor + 1;
	}
	return blocks;
}

/**
 * Map the rows of one Markdown leaf that belong to fenced code blocks.
 * Each block is replayed the way the renderer paints it (fence, indented
 * and wrapped lines, fence) and only claims its rows when every row
 * matches the rendered text, so an unexpected layout falls back to the
 * rendered slice rather than mislabeling rows.
 */
export function mapCodeRows(leaf: Leaf): Map<number, CodeRow> {
	const component = leaf.component;
	const margin = component.paddingX ?? 0;
	const contentWidth = Math.max(1, leaf.width - margin * 2);
	const text = component.options?.transform?.(component.text ?? "", contentWidth) ?? component.text ?? "";
	const normalized = text.replace(/\t/g, "   ");
	const indent = component.theme?.codeBlockIndent ?? "  ";
	const rows = leaf.lines.map((line) => plain(line).slice(margin));
	const map = new Map<number, CodeRow>();
	let row = 0;
	for (const block of fencedBlocks(text, normalized)) {
		const expected: { text: string; line: number; prefix: number; first: boolean }[] = [];
		block.normalized.forEach((line, lineIndex) => {
			wrapTextWithAnsi(indent + line, contentWidth).forEach((wrapped, wrapIndex) => {
				expected.push({
					text: wrapped.trimEnd(),
					line: lineIndex,
					prefix: margin + (wrapIndex === 0 ? indent.length : 0),
					first: wrapIndex === 0,
				});
			});
		});
		const opening = `\`\`\`${block.lang}`;
		let matched = false;
		for (; row < rows.length && !matched; row++) {
			if (rows[row] !== opening) continue;
			const fits =
				row + expected.length + 1 < rows.length &&
				expected.every((entry, offset) => rows[row + 1 + offset] === entry.text) &&
				rows[row + 1 + expected.length] === "```";
			if (!fits) continue;
			const rowsPerLine = new Map<number, number>();
			for (const entry of expected) rowsPerLine.set(entry.line, (rowsPerLine.get(entry.line) ?? 0) + 1);
			expected.forEach((entry, offset) => {
				map.set(row + 1 + offset, {
					line: entry.line,
					source: block.lines[entry.line],
					rows: rowsPerLine.get(entry.line) ?? 1,
					prefix: entry.prefix,
				});
			});
			row += expected.length + 1;
			matched = true;
		}
		if (!matched) break;
	}
	return map;
}

/** Columns the `│ ` gutter occupies on a tool-output row; header and closing rows own their text. */
function gutterPrefix(rowText: string): number {
	if (rowText.startsWith("│ ")) return 2;
	if (rowText === "│") return 1;
	return 0;
}

interface RowPlan {
	row: number;
	/** Chrome columns to drop when the selection starts inside them. */
	prefix: number;
	code?: CodeRow;
}

/**
 * Text for a selection over `contentLines`, the rendered lines of `root`
 * at `contentWidth`. Returns undefined when nothing is selected.
 */
export function extractSelection(
	root: Renderable,
	contentWidth: number,
	contentLines: readonly string[],
	selection: SelectionRange,
): string | undefined {
	const { start, end } = selection;
	if (end.row < start.row) return undefined;
	const leaves: Leaf[] = [];
	collectLeaves(root, contentWidth, 0, 0, start.row, end.row, leaves);
	const codeMaps = new Map<Leaf, Map<number, CodeRow>>();

	const plans: RowPlan[] = [];
	for (let row = start.row; row <= end.row; row++) {
		const plan: RowPlan = { row, prefix: 0 };
		plans.push(plan);
		const leaf = leaves.find((entry) => row >= entry.rowStart && row < entry.rowStart + entry.lines.length);
		if (!leaf) continue;
		const leafRow = row - leaf.rowStart;
		const painted = plain(contentLines[row] ?? "");
		// A parent that rewrites its children's lines would desync the walk; trust only exact matches.
		if (painted !== (" ".repeat(leaf.colOffset) + plain(leaf.lines[leafRow])).trimEnd()) continue;
		if (isMarkdown(leaf.component)) {
			let codeMap = codeMaps.get(leaf);
			if (!codeMap) {
				codeMap = mapCodeRows(leaf);
				codeMaps.set(leaf, codeMap);
			}
			const code = codeMap.get(leafRow);
			plan.prefix = leaf.colOffset + (code ? code.prefix : (leaf.component.paddingX ?? 0));
			plan.code = code;
		} else if (leaf.component instanceof Lines) {
			plan.prefix = leaf.colOffset + gutterPrefix(painted.slice(leaf.colOffset));
		} else {
			plan.prefix = leaf.colOffset;
		}
	}

	const columns = (plan: RowPlan): { start: number; end: number; full: boolean } => {
		const line = contentLines[plan.row] ?? "";
		const lineEnd = visibleWidth(plain(line));
		const from = plan.row === start.row ? start.col : 0;
		const to = plan.row === end.row ? (end.boundary ? end.col : end.col + 1) : lineEnd;
		return { start: Math.max(from, plan.prefix), end: Math.min(to, lineEnd), full: from <= plan.prefix && to >= lineEnd };
	};
	const slice = (plan: RowPlan): string => {
		const { start: from, end: to } = columns(plan);
		return plain(sliceByColumn(contentLines[plan.row] ?? "", from, Math.max(0, to - from), true));
	};

	const out: string[] = [];
	for (let index = 0; index < plans.length; ) {
		const plan = plans[index];
		if (!plan.code) {
			out.push(slice(plan));
			index++;
			continue;
		}
		// Gather every selected row of this source line; a fully covered line comes back verbatim.
		let last = index;
		while (last + 1 < plans.length && plans[last + 1].code?.line === plan.code.line && plans[last + 1].row === plans[last].row + 1) {
			last++;
		}
		const group = plans.slice(index, last + 1);
		const complete = group.length === plan.code.rows && group.every((entry) => columns(entry).full);
		if (complete) out.push(plan.code.source);
		else for (const entry of group) out.push(slice(entry));
		index = last + 1;
	}
	const text = out.join("\n");
	return text.length === 0 ? undefined : text;
}

interface LayoutBoxLike {
	component: Renderable;
	rect: { width: number };
	children: LayoutBoxLike[];
	scrollView?: unknown;
	scrollContentLines?: readonly string[];
}

function findScrollBox(box: LayoutBoxLike, scrollView: unknown): LayoutBoxLike | undefined {
	if (box.scrollView === scrollView) return box;
	for (const child of box.children) {
		const found = findScrollBox(child, scrollView);
		if (found) return found;
	}
	return undefined;
}

/** Read the live selection off a fullscreen renderer and resolve it against the transcript. */
function transcriptSelectionText(tui: Record<string, unknown>): string | undefined {
	const getBounds = tui.getSelectionBounds as (() => (SelectionRange & { start: { scrollView?: unknown } }) | undefined) | undefined;
	const selection = getBounds?.call(tui);
	const layout = tui.currentLayout as { root: LayoutBoxLike } | undefined;
	if (!selection?.start.scrollView || !layout) return undefined;
	const box = findScrollBox(layout.root, selection.start.scrollView);
	const content = box?.children[0];
	if (!box?.scrollContentLines || !content) return undefined;
	return extractSelection(content.component, content.rect.width, box.scrollContentLines, selection);
}

const INSTALLED = Symbol.for("pi-tui/transcript-copy");

/**
 * Replace the renderer's selection text with the transcript-backed one.
 * Idempotent per renderer instance, so callers may invoke it every frame:
 * pi swaps the renderer on a TUI mode change, and the marker travels with
 * the instance. Any failure yields pi's stock text.
 */
export function installTranscriptCopy(tui: unknown): void {
	const host = tui as Record<PropertyKey, unknown>;
	if (host[INSTALLED] || host.mode !== "fullscreen") return;
	const original = host.getActiveSelectionText;
	if (typeof original !== "function") return;
	host[INSTALLED] = true;
	host.getActiveSelectionText = function (this: Record<string, unknown>) {
		try {
			const text = transcriptSelectionText(this);
			if (text !== undefined) return text;
		} catch {
			// Fall through to the rendered slice.
		}
		return (original as () => string | undefined).call(this);
	};
}
