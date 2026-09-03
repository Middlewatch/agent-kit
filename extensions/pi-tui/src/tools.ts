/**
 * Gutter rendering for the built-in tools. Each override spreads the
 * original definition (description, parameters, prompt metadata, shims),
 * delegates execution to a per-call instance built with the session cwd,
 * and replaces only the rendering: renderShell "self" so no background
 * Box is painted, header + gutter + closing line instead.
 */
import type { AgentToolResult, ExtensionAPI, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import {
	closingLine,
	collapseOutput,
	colorDiffLine,
	formatDuration,
	type GlyphState,
	gutterLines,
	headerLine,
	Lines,
	type Style,
} from "./gutter.ts";

type AnyResult = AgentToolResult<any>;
type AnyArgs = Record<string, any>;

/** The slice of pi's ToolRenderContext (not exported) that rendering uses. */
interface RenderContext {
	toolCallId: string;
	isPartial: boolean;
	isError: boolean;
}

export interface GutterToolSpec {
	name: string;
	create: (cwd: string) => any;
	/** One-line args summary after the tool name; qualifiers dim. */
	summary: (args: AnyArgs, style: Style) => string;
	/** Output lines for the gutter; defaults to the text content. */
	outputLines?: (result: AnyResult, style: Style) => string[];
	/** Collapsed-view line budget. */
	collapsed: number;
	/** Which end of the output the collapsed view keeps. */
	keep: "head" | "tail";
	/** Extra closing-line parts (counts, diffstat). */
	closingParts?: (result: AnyResult, style: Style) => string[];
}

function textOf(result: AnyResult): string {
	const block = result.content.find((c: { type: string }) => c.type === "text") as { text?: string } | undefined;
	return block?.text ?? "";
}

function textLines(result: AnyResult): string[] {
	const text = textOf(result);
	return text === "" ? [] : text.split("\n");
}

const dim = (style: Style, text: string) => style.fg("dim", text);

/** Default output rendering: muted, so assistant prose stays the brightest text on screen. */
function mutedTextLines(result: AnyResult, style: Style): string[] {
	return textLines(result).map((line) => style.fg("muted", line));
}

function firstLine(text: string): string {
	const index = text.indexOf("\n");
	return index === -1 ? text : `${text.slice(0, index)} …`;
}

const SPECS: GutterToolSpec[] = [
	{
		name: "bash",
		create: createBashTool,
		collapsed: 6,
		keep: "tail",
		summary: (args, style) =>
			firstLine(String(args.command ?? "")) + (args.timeout ? ` ${dim(style, `(timeout ${args.timeout}s)`)}` : ""),
	},
	{
		name: "read",
		create: createReadTool,
		collapsed: 0,
		keep: "head",
		summary: (args, style) => {
			const range: string[] = [];
			if (args.offset) range.push(`from ${args.offset}`);
			if (args.limit) range.push(`${args.limit} lines`);
			return String(args.path ?? "") + (range.length ? ` ${dim(style, `(${range.join(", ")})`)}` : "");
		},
		closingParts: (result, style) => {
			const truncation = (result.details as { truncation?: { totalLines?: number } } | undefined)?.truncation;
			const total = truncation?.totalLines ?? textLines(result).length;
			return [dim(style, `${total} lines`)];
		},
	},
	{
		name: "edit",
		create: createEditTool,
		collapsed: 8,
		keep: "head",
		summary: (args, style) => {
			const count = Array.isArray(args.edits) ? args.edits.length : 1;
			return String(args.path ?? "") + (count > 1 ? ` ${dim(style, `(${count} edits)`)}` : "");
		},
		outputLines: (result, style) => {
			const diff = (result.details as { diff?: string } | undefined)?.diff;
			if (!diff) return mutedTextLines(result, style);
			return diff.split("\n").map((line) => colorDiffLine(style, line));
		},
		closingParts: (result, style) => {
			const diff = (result.details as { diff?: string } | undefined)?.diff;
			if (!diff) return [];
			let added = 0;
			let removed = 0;
			for (const line of diff.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
				if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
			}
			return [`${style.fg("toolDiffAdded", `+${added}`)} ${style.fg("toolDiffRemoved", `-${removed}`)}`];
		},
	},
	{
		name: "write",
		create: createWriteTool,
		collapsed: 0,
		keep: "head",
		summary: (args, style) => {
			const count = String(args.content ?? "").split("\n").length;
			return `${String(args.path ?? "")} ${dim(style, `(${count} lines)`)}`;
		},
	},
	{
		name: "grep",
		create: createGrepTool,
		collapsed: 6,
		keep: "head",
		summary: (args, style) => {
			const where = [args.path, args.glob && `glob ${args.glob}`, args.ignoreCase && "-i"].filter(Boolean);
			return `${String(args.pattern ?? "")}${where.length ? ` ${dim(style, `(${where.join(", ")})`)}` : ""}`;
		},
	},
	{
		name: "find",
		create: createFindTool,
		collapsed: 6,
		keep: "head",
		summary: (args, style) => String(args.pattern ?? "") + (args.path ? ` ${dim(style, `(in ${args.path})`)}` : ""),
	},
	{
		name: "ls",
		create: createLsTool,
		collapsed: 6,
		keep: "head",
		summary: (args, _style) => String(args.path ?? "."),
	},
];

/** Everything renderResult needs, resolved before line building. */
export interface ResultView {
	isError: boolean;
	isPartial: boolean;
	expanded: boolean;
	durationMs?: number;
	truncated: boolean;
}

/** Build the gutter + closing lines for one tool result. Pure; unit-tested. */
export function resultLines(spec: GutterToolSpec, result: AnyResult, view: ResultView, style: Style, width: number): string[] {
	const raw = view.isError
		? textLines(result).map((line) => style.fg("error", line))
		: (spec.outputLines ?? mutedTextLines)(result, style);
	const { shown, hidden } = collapseOutput(raw, view.expanded, spec.collapsed, spec.keep);
	const lines = gutterLines(style, shown, width);
	if (view.isPartial) return lines;

	const parts: string[] = [view.isError ? style.fg("error", "error") : style.fg("success", "ok")];
	if (!view.isError && spec.closingParts) parts.push(...spec.closingParts(result, style));
	if (view.durationMs !== undefined) parts.push(dim(style, formatDuration(view.durationMs)));
	if (hidden > 0) parts.push(dim(style, `${hidden} ${hidden === 1 ? "line" : "lines"} hidden`));
	if (view.truncated) parts.push(style.fg("warning", "truncated"));
	lines.push(closingLine(style, parts, width));
	return lines;
}

export function registerGutterTools(pi: ExtensionAPI): void {
	const durations = new Map<string, number>();
	const remember = (id: string, ms: number) => {
		durations.set(id, ms);
		if (durations.size > 400) {
			const oldest = durations.keys().next().value;
			if (oldest !== undefined) durations.delete(oldest);
		}
	};

	for (const spec of SPECS) {
		const original = spec.create(process.cwd());

		const glyphState = (context: RenderContext): GlyphState =>
			context.isError ? "error" : context.isPartial ? "pending" : "ok";

		pi.registerTool({
			...original,
			renderShell: "self",

			async execute(toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) {
				const started = Date.now();
				try {
					return await spec.create(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
				} finally {
					remember(toolCallId, Date.now() - started);
				}
			},

			renderCall(args: AnyArgs, theme: Theme, context: RenderContext) {
				return new Lines((width) => [headerLine(theme, glyphState(context), spec.name, spec.summary(args ?? {}, theme), width)]);
			},

			renderResult(result: AnyResult, options: ToolRenderResultOptions, theme: Theme, context: RenderContext) {
				const view: ResultView = {
					isError: context.isError,
					isPartial: options.isPartial,
					expanded: options.expanded,
					durationMs: durations.get(context.toolCallId),
					truncated: Boolean((result.details as { truncation?: { truncated?: boolean } } | undefined)?.truncation?.truncated),
				};
				return new Lines((width) => resultLines(spec, result, view, theme, width));
			},
		});
	}
}

export { SPECS };
