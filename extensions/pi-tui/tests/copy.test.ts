import { Box, Container, Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { extractSelection, fencedBlocks, installTranscriptCopy } from "../src/copy.ts";
import { Lines } from "../src/gutter.ts";

/** ANSI-styling theme: proves the extractor reads through escape codes. */
const theme: MarkdownTheme = {
	heading: (t) => `\x1b[1m${t}\x1b[22m`,
	link: (t) => t,
	linkUrl: (t) => t,
	code: (t) => `\x1b[36m${t}\x1b[39m`,
	codeBlock: (t) => `\x1b[32m${t}\x1b[39m`,
	codeBlockBorder: (t) => `\x1b[2m${t}\x1b[22m`,
	quote: (t) => t,
	quoteBorder: (t) => t,
	hr: (t) => t,
	listBullet: (t) => t,
	bold: (t) => `\x1b[1m${t}\x1b[22m`,
	italic: (t) => t,
	strikethrough: (t) => t,
	underline: (t) => t,
};

const LISP = [
	"(defun lab-shortlist-menu ()",
	'  "Display the current project\'s shortlist."',
	"  (interactive)",
	"  (let* ((root (lab-shortlist--project-root))",
	"         (slots (gethash root lab-shortlist--projects [])))",
	"    (pop-to-buffer buffer)))",
].join("\n");

const WIDTH = 60;

/** An assistant turn the way pi nests it: message container → content container → Markdown(pad 1). */
function assistantTurn(markdown: string): { root: Container; lines: string[] } {
	const root = new Container();
	const message = new Container();
	const content = new Container();
	content.addChild(new Markdown(markdown, 1, 0, theme));
	message.addChild(content);
	root.addChild(message);
	return { root, lines: root.render(WIDTH) };
}

const findRow = (lines: string[], needle: string): number => {
	const row = lines.findIndex((line) => line.includes(needle));
	if (row < 0) throw new Error(`no row containing ${needle}`);
	return row;
};

/** Drag from the first column of `fromRow` to past the end of `toRow`, the way a mouse sweep lands. */
const sweep = (fromRow: number, toRow: number) => ({ start: { row: fromRow, col: 0 }, end: { row: toRow, col: WIDTH - 1 } });

describe("fencedBlocks", () => {
	it("pairs fences and keeps the lang", () => {
		const source = "intro\n```elisp\n(a)\n\tb\n```\nafter\n~~~\nx\n~~~\n";
		const blocks = fencedBlocks(source, source.replace(/\t/g, "   "));
		expect(blocks.map((b) => b.lang)).toEqual(["elisp", ""]);
		expect(blocks[0].lines).toEqual(["(a)", "\tb"]);
		expect(blocks[0].normalized).toEqual(["(a)", "   b"]);
	});

	it("drops an unterminated fence", () => {
		expect(fencedBlocks("```\nopen", "```\nopen")).toEqual([]);
	});
});

describe("extractSelection on code blocks", () => {
	it("returns the source lines without margin or indent", () => {
		const { root, lines } = assistantTurn(`Here:\n\n\`\`\`elisp\n${LISP}\n\`\`\`\n\nDone.`);
		expect(lines[findRow(lines, "(defun")]).toMatch(/^ {3}\x1b/); // margin + indent, so the fixture reproduces the bug
		const first = findRow(lines, "(defun");
		const last = findRow(lines, "(pop-to-buffer");
		expect(extractSelection(root, WIDTH, lines, sweep(first, last))).toBe(LISP);
	});

	it("rejoins a wrapped line and keeps a tab", () => {
		const long = `(setq value ${"x".repeat(70)})`;
		const source = `\tindented\n${long}\nend`;
		const { root, lines } = assistantTurn(`\`\`\`\n${source}\n\`\`\``);
		const first = findRow(lines, "indented");
		const last = findRow(lines, "end");
		expect(last - first).toBeGreaterThan(2); // the long line took several rows
		expect(extractSelection(root, WIDTH, lines, sweep(first, last))).toBe(source);
	});

	it("slices a partial first row and copies the rest verbatim", () => {
		const { root, lines } = assistantTurn(`\`\`\`elisp\n${LISP}\n\`\`\``);
		const first = findRow(lines, "(defun");
		const text = extractSelection(root, WIDTH, lines, { start: { row: first, col: 10 }, end: { row: first + 2, col: WIDTH - 1 } });
		expect(text).toBe(["lab-shortlist-menu ()", '  "Display the current project\'s shortlist."', "  (interactive)"].join("\n"));
	});

	it("returns the fence itself without the margin when the drag includes it", () => {
		const { root, lines } = assistantTurn(`\`\`\`elisp\n${LISP}\n\`\`\``);
		const text = extractSelection(root, WIDTH, lines, sweep(0, 1));
		expect(text).toBe("```elisp\n(defun lab-shortlist-menu ()");
	});

	it("handles a second block and blank code lines", () => {
		const { root, lines } = assistantTurn("```\na\n```\n\ntext\n\n```py\nx = 1\n\ny = 2\n```");
		const first = findRow(lines, "x = 1");
		expect(extractSelection(root, WIDTH, lines, sweep(first, first + 2))).toBe("x = 1\n\ny = 2");
	});
});

describe("extractSelection on other content", () => {
	it("drops the message margin from prose", () => {
		const { root, lines } = assistantTurn("First paragraph.\n\nSecond **bold** paragraph.");
		expect(extractSelection(root, WIDTH, lines, sweep(0, 2))).toBe("First paragraph.\n\nSecond bold paragraph.");
	});

	it("drops box padding from a user message", () => {
		const root = new Container();
		const box = new Box(1, 1, (t) => `\x1b[44m${t}\x1b[49m`);
		box.addChild(new Markdown("hello there", 0, 0, theme));
		root.addChild(box);
		const lines = root.render(WIDTH);
		expect(lines.length).toBe(3);
		expect(extractSelection(root, WIDTH, lines, sweep(1, 1))).toBe("hello there");
	});

	it("drops the gutter bar from tool output behind pi's blank-row tool shell", () => {
		// ToolExecutionComponent (self shell) paints "" then its child container's lines.
		class ToolShell extends Container {
			override render(width: number): string[] {
				return ["", ...super.render(width)];
			}
		}
		const root = new Container();
		const shell = new ToolShell();
		const inner = new Container();
		inner.addChild(new Lines(() => ["● bash ls", "\x1b[2m│ \x1b[22ma.ts", "\x1b[2m│\x1b[22m", "╰ ok"]));
		shell.addChild(inner);
		root.addChild(shell);
		const lines = root.render(WIDTH);
		expect(lines[0]).toBe("");
		expect(extractSelection(root, WIDTH, lines, sweep(1, 4))).toBe("● bash ls\na.ts\n\n╰ ok");
	});

	it("keeps a column-anchored selection inside prose", () => {
		const { root, lines } = assistantTurn("abcdefghijkl");
		expect(extractSelection(root, WIDTH, lines, { start: { row: 0, col: 4 }, end: { row: 0, col: 8 } })).toBe("defgh");
		expect(extractSelection(root, WIDTH, lines, { start: { row: 0, col: 4 }, end: { row: 0, col: 8, boundary: true } })).toBe("defg");
	});

	it("falls back to the rendered slice when a parent rewrites its children's rows", () => {
		const root = new Container();
		const rewriting = new Container();
		rewriting.addChild(new Markdown(`\`\`\`\n${LISP}\n\`\`\``, 1, 0, theme));
		rewriting.render = (width) => Container.prototype.render.call(rewriting, width).map((line) => `~${line}`);
		root.addChild(rewriting);
		const lines = root.render(WIDTH);
		const first = findRow(lines, "(defun");
		expect(extractSelection(root, WIDTH, lines, sweep(first, first))).toBe("~   (defun lab-shortlist-menu ()");
	});

	it("returns undefined for an empty selection", () => {
		const { root, lines } = assistantTurn("");
		expect(extractSelection(root, WIDTH, lines, sweep(0, 0))).toBeUndefined();
	});
});

describe("installTranscriptCopy", () => {
	it("overrides only fullscreen renderers, once, and falls back on failure", () => {
		let calls = 0;
		const original = () => `stock ${++calls}`;
		const regular = { mode: "regular", getActiveSelectionText: original };
		installTranscriptCopy(regular);
		expect(regular.getActiveSelectionText).toBe(original);

		const fullscreen: Record<string, unknown> = {
			mode: "fullscreen",
			getActiveSelectionText: original,
			getSelectionBounds: () => {
				throw new Error("layout not ready");
			},
		};
		installTranscriptCopy(fullscreen);
		const installed = fullscreen.getActiveSelectionText;
		installTranscriptCopy(fullscreen);
		expect(fullscreen.getActiveSelectionText).toBe(installed);
		expect((installed as () => string).call(fullscreen)).toBe("stock 1");
	});

	it("resolves the selection through the layout frame", () => {
		const { root, lines } = assistantTurn(`\`\`\`elisp\n${LISP}\n\`\`\``);
		const scrollView = {};
		const first = findRow(lines, "(defun");
		const tui: Record<string, unknown> = {
			mode: "fullscreen",
			getActiveSelectionText: () => "stock",
			getSelectionBounds: () => ({ start: { row: first, col: 0, scrollView }, end: { row: first + 1, col: WIDTH - 1, scrollView } }),
			currentLayout: {
				root: {
					component: {},
					rect: { width: WIDTH },
					children: [
						{
							component: {},
							rect: { width: WIDTH },
							scrollView,
							scrollContentLines: lines,
							children: [{ component: root, rect: { width: WIDTH }, children: [] }],
						},
					],
				},
			},
		};
		installTranscriptCopy(tui);
		expect((tui.getActiveSelectionText as () => string).call(tui)).toBe(LISP.split("\n").slice(0, 2).join("\n"));
	});
});
