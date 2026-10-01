/**
 * The questionnaire dialog: draws a `Questionnaire` (lib.ts) and turns keys
 * into its transitions. Text entry is delegated to two headless pi-tui
 * editors, one for the free-text row and one for notes.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  CURSOR_MARKER,
  Editor,
  Key,
  type Keybinding,
  type KeybindingsManager,
  Markdown,
  matchesKey,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { answerText, NEXT_LABEL, OTHER_LABEL, type Questionnaire, type Result, scrollStart, tabWindow } from "./lib.ts";

/** Hides the dialog so the transcript behind it can be read, and brings it back. */
export const COLLAPSE_KEY = "ctrl+]";
const COLLAPSE_KEY_LABEL = "Ctrl+]";

/** Below this width a preview stacks under the options instead of beside them. */
const SIDE_BY_SIDE_MIN_WIDTH = 100;
const OPTIONS_MIN_WIDTH = 30;
const COLUMN_GAP = 2;
/** Preview rows shown before the box cuts off: beside the options, and stacked under them. */
const PREVIEW_ROWS_SIDE = 16;
const PREVIEW_ROWS_STACKED = 11;
const PREVIEW_MIN_CONTENT_WIDTH = 40;
const POINTER = "❯ ";

export interface ViewOptions {
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  questionnaire: Questionnaire;
  done(result: Result): void;
  /** Hide or show the overlay. Absent when a hidden overlay could not be reopened; collapse then shrinks to one row. */
  setHidden?(hidden: boolean): void;
}

interface Block {
  lines: string[];
  /** Rows of the focused item within `lines`, for scrolling. */
  focus?: [number, number];
}

export class QuestionnaireView implements Component {
  private readonly o: ViewOptions;
  private readonly input: Editor;
  private readonly notes: Editor;
  private readonly previews = new Map<string, Markdown>();
  private cache: { key: string; lines: string[] } | undefined;
  /** The external editor owns the terminal. */
  private suspended = false;
  private finished = false;

  constructor(options: ViewOptions) {
    this.o = options;
    const { theme } = options;
    const editorTheme = {
      borderColor: (text: string) => theme.fg("borderMuted", text),
      selectList: {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => theme.fg("accent", text),
        description: (text: string) => theme.fg("muted", text),
        scrollInfo: (text: string) => theme.fg("dim", text),
        noMatch: (text: string) => theme.fg("warning", text),
      },
    };
    this.input = new Editor(options.tui, editorTheme);
    this.notes = new Editor(options.tui, editorTheme);
    // Enter is routed here, not by the editors: their own submit would clear the buffer.
    this.input.disableSubmit = true;
    this.notes.disableSubmit = true;
  }

  invalidate(): void {
    this.cache = undefined;
    for (const preview of this.previews.values()) preview.invalidate();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  handleInput(data: string): void {
    if (this.suspended || this.finished) return;
    const q = this.o.questionnaire;
    const key = (name: string): boolean => this.o.keybindings.matches(data, name as Keybinding);
    // A key bound to newline stays a newline even when it is also bound to confirm.
    const newLine = key("tui.input.newLine");
    const confirm = !newLine && (key("tui.select.confirm") || key("tui.input.submit"));
    const cancel = key("tui.select.cancel");

    if (matchesKey(data, COLLAPSE_KEY)) {
      this.toggleCollapsed();
      return;
    }
    if (q.collapsed) {
      // Answers that cannot be seen cannot be changed; only cancel gets through.
      if (cancel) q.cancel();
    } else if (q.notesOpen) {
      if (cancel || confirm) q.closeNotes(this.notes.getExpandedText());
      else this.notes.handleInput(data);
    } else if (q.typing) {
      const cursor = this.input.getCursor();
      if (confirm) q.confirm();
      else if (cancel) q.cancel();
      else if (key("tui.editor.deleteToLineStart")) q.setDraft("");
      else if (key("app.editor.external")) void this.editExternally();
      else if (matchesKey(data, Key.tab)) q.switchTab(1);
      else if (matchesKey(data, Key.shift("tab"))) q.switchTab(-1);
      else if (key("tui.select.up") && cursor.line === 0) q.move(-1);
      else if (key("tui.select.down") && cursor.line >= this.input.getLines().length - 1) q.move(1);
      else {
        this.input.handleInput(data);
        q.setDraft(this.input.getExpandedText());
      }
    } else if (cancel) q.cancel();
    else if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) q.switchTab(1);
    else if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) q.switchTab(-1);
    else if (key("tui.select.up")) q.move(-1);
    else if (key("tui.select.down")) q.move(1);
    else if (data === "n") this.notes.setText(q.openNotes());
    else if (data === " ") q.toggle();
    else if (confirm) q.confirm();
    else return;
    this.changed();
  }

  /** Also called from the raw terminal listener, which is the only input path while the overlay is hidden. */
  toggleCollapsed(): void {
    if (this.suspended || this.finished) return;
    const q = this.o.questionnaire;
    q.collapsed = !q.collapsed;
    this.o.setHidden?.(q.collapsed);
    this.changed();
  }

  private changed(): void {
    const q = this.o.questionnaire;
    if (q.result) {
      if (!this.finished) this.o.done(q.result);
      this.finished = true;
      return;
    }
    // The questionnaire owns the draft; the editor follows it across tab switches, clears, and external edits.
    if (q.typing && this.input.getExpandedText() !== q.draft()) this.input.setText(q.draft());
    this.notes.focused = q.notesOpen;
    this.cache = undefined;
    this.o.tui.requestRender();
  }

  /** Ctrl+G: round-trip the typed answer through $VISUAL, $EDITOR, or nvim. */
  private async editExternally(): Promise<void> {
    const { tui, questionnaire: q } = this.o;
    const command = process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || "nvim";
    const [editor, ...args] = command.split(" ");
    const dir = mkdtempSync(join(tmpdir(), "pi-ask-user-question-"));
    const file = join(dir, "answer.md");
    this.suspended = true;
    try {
      writeFileSync(file, q.draft(), "utf8");
      // A bare stop() in fullscreen dumps the rendered frame into scrollback.
      tui.stop(tui.mode === "fullscreen" ? { preserveScreen: true } : undefined);
      const code = await new Promise<number | null>((resolve) => {
        const child = spawn(editor as string, [...args, file], { stdio: "inherit" });
        child.on("error", () => resolve(null));
        child.on("close", resolve);
      });
      tui.start();
      tui.requestRender(true);
      if (code === 0) q.setDraft(readFileSync(file, "utf8").replace(/\r?\n$/, ""));
    } finally {
      rmSync(dir, { recursive: true, force: true });
      this.suspended = false;
      this.changed();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(width: number): string[] {
    const rows = this.o.tui.terminal.rows;
    const key = `${width}x${rows}`;
    if (this.cache?.key === key) return this.cache.lines;
    const lines = this.layout(Math.max(1, width), rows).map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width, "") : line));
    this.cache = { key, lines };
    return lines;
  }

  private layout(width: number, terminalRows: number): string[] {
    const { theme, questionnaire: q } = this.o;
    if (q.collapsed) return [theme.fg("dim", ` ${COLLAPSE_KEY_LABEL} show questions · Esc cancel `)];

    const border = theme.fg("accent", "─".repeat(width));
    const top = q.tabbed ? [border, this.tabBar(width), ""] : [border, ""];
    const tabs = q.tabbed ? q.questions.length + 1 : 1;
    const middle = this.middle(q.tab, width, true);
    const bottom = [border, ...this.footer(q.tab, width)];
    const natural = top.length + middle.lines.length + bottom.length;

    // Every tab gets the height of the tallest one, so the bottom-anchored dialog does not jump on a tab switch.
    // The current tab is measured at rest too: typing drops its preview, which must not shrink the dialog.
    let tallest = natural;
    for (let tab = 0; tab < tabs; tab++) {
      tallest = Math.max(tallest, top.length + this.middle(tab, width, false).lines.length + 1 + this.footer(tab, width).length);
    }
    if (natural <= terminalRows) {
      return [...top, ...middle.lines, ...bottom, ...Array<string>(Math.min(tallest, terminalRows) - natural).fill("")];
    }

    // Taller than the terminal: scroll the middle between the fixed top and bottom, centered on the focused row.
    const visible = terminalRows - top.length - bottom.length;
    if (visible <= 0) return [...top, ...bottom].slice(0, terminalRows);
    const start = scrollStart(middle.focus, visible, middle.lines.length);
    const window = middle.lines.slice(start, start + visible);
    if (start > 0) window[0] = theme.fg("dim", "↑");
    if (start + visible < middle.lines.length) window[window.length - 1] = theme.fg("dim", start > 0 && window.length === 1 ? "↕" : "↓");
    return [...top, ...window, ...bottom];
  }

  private tabBar(width: number): string {
    const { theme, questionnaire: q } = this.o;
    const segments = q.questions.map((question, i) => {
      const answered = q.answers.has(i);
      const raw = ` ${answered ? "■" : "□"} ${question.header || `Q${i + 1}`} `;
      return { raw, styled: i === q.tab ? theme.bg("selectedBg", theme.fg("text", raw)) : theme.fg(answered ? "success" : "muted", raw) };
    });
    const submit = " ✓ Submit ";
    segments.push({
      raw: submit,
      styled: q.onSubmitTab ? theme.bg("selectedBg", theme.fg("text", submit)) : theme.fg(q.unanswered().length === 0 ? "success" : "dim", submit),
    });
    const [lo, hi] = tabWindow(segments.map((segment) => visibleWidth(segment.raw)), q.tab, width);
    const more = theme.fg("dim", "…");
    const shown = segments.slice(lo, hi + 1).map((segment) => segment.styled);
    if (lo > 0) shown.unshift(more);
    if (hi < segments.length - 1) shown.push(more);
    return ` ← ${shown.join(" ")} →`;
  }

  /** Everything between the top chrome and the bottom border. `live` is the tab on screen; other tabs are only measured. */
  private middle(tab: number, width: number, live: boolean): Block {
    const { theme, questionnaire: q } = this.o;
    const question = q.questions[tab];
    const lines: string[] = [];
    let focus: [number, number] | undefined;

    if (!question) {
      lines.push(` ${theme.bold(theme.fg("accent", "Review your answers"))}`, "");
      q.questions.forEach((asked, i) => {
        const answer = q.answers.get(i);
        if (!answer) return;
        lines.push(theme.fg("muted", `  ● ${asked.header || `Q${i + 1}`}`));
        lines.push(...indent(`${theme.fg("muted", "→")} ${answerText(answer)}`, "    ", width));
        if (answer.notes) lines.push(...indent(theme.fg("dim", `notes: ${answer.notes}`), "      ", width));
      });
      const globalNote = q.note(q.questions.length);
      if (globalNote && !(live && q.notesOpen)) {
        lines.push(theme.fg("muted", "  ● Note"), ...indent(`${theme.fg("muted", "→")} ${globalNote}`, "    ", width));
      }
    } else {
      if (!q.tabbed && question.header) lines.push(` ${theme.bg("selectedBg", ` ${question.header} `)}`, "");
      lines.push(...indent(theme.bold(question.question), " ", width), "");
      const body = this.body(tab, width, live);
      if (body.focus) focus = [lines.length + body.focus[0], lines.length + body.focus[1]];
      lines.push(...body.lines);
    }
    lines.push("");
    if (live && q.notesOpen) {
      lines.push(theme.fg("muted", question ? " Note:" : " Note for the whole questionnaire:"), ...this.notes.render(width), "");
    } else if (question && q.note(tab)) {
      lines.push(...indent(theme.fg("dim", `Note: ${q.note(tab)}`), " ", width), "");
    }
    return { lines, focus };
  }

  /** Option rows, with the focused option's preview beside or under them when the question has previews. */
  private body(tab: number, width: number, live: boolean): Block {
    const q = this.o.questionnaire;
    const question = q.questions[tab]!;
    const typing = live && q.typing;
    const hasPreview = !question.multiSelect && question.options.some((option) => option.preview);
    // While typing, the row takes the full width so a long answer is not squeezed into the options column.
    if (!hasPreview || typing) return this.optionRows(tab, width, live);

    const side = width >= SIDE_BY_SIDE_MIN_WIDTH;
    // The options column gets what the widest preview does not need, between a floor and half the dialog.
    // Six columns of overhead: the box's borders and padding, and the two-space indent markdown gives code blocks.
    const previewNeed = Math.max(PREVIEW_MIN_CONTENT_WIDTH, ...question.options.flatMap((option) => (option.preview ?? "").split("\n").map((line) => visibleWidth(line)))) + 6;
    const left = side ? Math.max(OPTIONS_MIN_WIDTH, Math.min(width - COLUMN_GAP - previewNeed, Math.floor(width / 2))) : width;
    const boxWidth = side ? width - left - COLUMN_GAP : width;
    const options = this.optionRows(tab, left, live);
    const focused = live ? q.focused : undefined;
    const box = this.previewBox(tab, focused?.kind === "option" ? focused.index : live ? -1 : 0, boxWidth, side);
    // Reserve the tallest preview so the dialog keeps its height as the focus moves between options.
    const tallest = Math.max(...question.options.map((_, index) => this.previewBox(tab, index, boxWidth, side).length));
    while (box.length < tallest) box.push("");
    if (!side) return { lines: [...options.lines, "", ...box], focus: options.focus };

    const lines: string[] = [];
    for (let i = 0; i < Math.max(options.lines.length, box.length); i++) {
      const cell = options.lines[i] ?? "";
      const padded = visibleWidth(cell) > left ? truncateToWidth(cell, left, "") : cell + " ".repeat(left - visibleWidth(cell));
      lines.push(`${padded}${" ".repeat(COLUMN_GAP)}${box[i] ?? ""}`);
    }
    return { lines, focus: options.focus };
  }

  private optionRows(tab: number, width: number, live: boolean): Block {
    const { theme, questionnaire: q } = this.o;
    const question = q.questions[tab]!;
    const answer = q.answers.get(tab);
    const rows = q.rows(tab);
    const numberWidth = String(rows.length).length;
    const lines: string[] = [];
    let focus: [number, number] | undefined;
    const selected = (text: string): string => theme.fg("accent", theme.bold(text));

    rows.forEach((row, i) => {
      const active = live && i === q.row;
      const start = lines.length;
      const number = row.kind === "next" ? "" : `${String(i + 1).padStart(numberWidth)}. `;
      const box = question.multiSelect && row.kind === "option" ? (q.isChecked(tab, row.index) ? `${theme.fg("accent", "[✔]")} ` : "[ ] ") : "";
      const prefix = `${active ? theme.fg("accent", POINTER) : "  "}${number}${box}`;
      const contentWidth = Math.max(1, width - visibleWidth(prefix));
      let label: string;
      let confirmed = false;
      if (row.kind === "option") {
        label = question.options[row.index]!.label;
        confirmed = answer?.kind === "option" && answer.answer === label;
      } else if (row.kind === "next") {
        label = NEXT_LABEL;
      } else if (active && !q.notesOpen) {
        label = this.inputWithCursor();
      } else {
        label = q.draft(tab) || OTHER_LABEL;
        confirmed = answer?.kind === "custom" && answer.answer === label;
      }
      if (confirmed) label += " ✔";
      const styled = active || confirmed ? selected : (text: string) => text;
      lines.push(...indent(label, prefix, width, styled));
      if (row.kind === "option") {
        const description = question.options[row.index]!.description;
        if (description) lines.push(...indent(description, " ".repeat(width - contentWidth), width, (text) => theme.fg("muted", text)));
      }
      if (active) focus = [start, lines.length];
    });
    return { lines, focus };
  }

  /** The free-text draft with a reverse-video cell at the cursor, as pi's own editor draws it. */
  private inputWithCursor(): string {
    const lines = this.input.getLines();
    const cursor = this.input.getCursor();
    const text = lines.join("\n");
    if (text.length === 0) return `${CURSOR_MARKER}\x1b[7m\xa0\x1b[27m${this.o.theme.fg("dim", OTHER_LABEL)}`;
    let offset = cursor.col;
    for (let i = 0; i < cursor.line; i++) offset += lines[i]!.length + 1;
    const [grapheme] = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.slice(offset));
    const at = grapheme?.segment ?? "";
    // A newline or a space has no cell to invert: draw the cursor on a no-break space and keep the newline.
    const cell = at === "" || at === " " || at === "\n" ? "\xa0" : at;
    return `${text.slice(0, offset)}${CURSOR_MARKER}\x1b[7m${cell}\x1b[27m${text.slice(offset + (at === "\n" ? 0 : at.length))}`;
  }

  /** A bordered box holding option `index`'s preview rendered as markdown; index -1 is a row with no preview. */
  private previewBox(tab: number, index: number, width: number, side: boolean): string[] {
    const { theme, questionnaire: q } = this.o;
    const inner = Math.max(1, width - 4);
    const source = q.questions[tab]!.options[index]?.preview;
    let content = [theme.fg("dim", "No preview available")];
    if (source) {
      const cacheKey = `${tab}:${index}`;
      let markdown = this.previews.get(cacheKey);
      if (!markdown) this.previews.set(cacheKey, (markdown = new Markdown(source, 0, 0, getMarkdownTheme())));
      // The box already frames the content, so code-fence marker lines are noise.
      content = markdown.render(inner).filter((line) => !/^`{3}/.test(line.replace(/\x1b\[[0-9;]*m/g, "")));
    }
    const budget = side ? PREVIEW_ROWS_SIDE : PREVIEW_ROWS_STACKED;
    const hidden = Math.max(0, content.length - budget);
    const shown = content.slice(0, budget);
    const span = Math.min(inner, Math.max(PREVIEW_MIN_CONTENT_WIDTH, ...shown.map((line) => visibleWidth(line.trimEnd())))) + 2;
    const accent = (text: string): string => theme.fg("accent", text);
    const cut = ` ✂ ${hidden} lines hidden `;
    const bottomRule = hidden > 0 && span > cut.length ? `${"─".repeat(span - cut.length - 1)}${cut}─` : "─".repeat(span);
    return [
      accent(`┌${"─".repeat(span)}┐`),
      ...shown.map((line) => `${accent("│")} ${truncateToWidth(line, span - 2, "", true)} ${accent("│")}`),
      accent(`└${bottomRule}┘`),
    ];
  }

  /** Rows under the bottom border: the Submit tab's prompt and picker, then the key hints. */
  private footer(tab: number, width: number): string[] {
    const { theme, questionnaire: q } = this.o;
    const question = q.questions[tab];
    const live = tab === q.tab;
    const lines = [""];
    let hints: string[];
    if (!question) {
      const missing = q.unanswered();
      lines.push(
        ...indent(missing.length === 0 ? theme.fg("muted", "Ready to submit your answers?") : theme.fg("warning", `⚠ Not answered yet: ${missing.join(", ")}`), " ", width),
      );
      ["Submit answers", "Cancel"].forEach((label, i) => {
        const active = live && q.submitRow === i;
        lines.push(`${active ? theme.fg("accent", POINTER) : "  "}${i + 1}. ${active ? theme.fg("accent", theme.bold(label)) : label}`);
      });
      hints = ["Enter select", "↑↓ move", "n note", "Tab question", "Esc cancel", `${COLLAPSE_KEY_LABEL} hide`];
    } else if (live && q.typing) {
      hints = ["Enter answer", "Shift+Enter newline", "Ctrl+U clear", "Ctrl+G editor", "↑↓ move", "Esc cancel"];
    } else {
      hints = ["Enter select", "↑↓ move"];
      if (question.multiSelect) hints.push("Space toggle");
      hints.push("n note");
      if (q.tabbed) hints.push("Tab question");
      hints.push("Esc cancel", `${COLLAPSE_KEY_LABEL} hide`);
    }
    if (live && q.notesOpen) hints = ["Enter save note", "Shift+Enter newline", "Esc close note"];
    lines.push(` ${truncateToWidth(theme.fg("dim", hints.join(" · ")), Math.max(1, width - 1), "…")}`);
    return lines;
  }
}

/** Wrap `text` to `width` with `prefix` on the first line and matching spaces on the rest. */
function indent(text: string, prefix: string, width: number, style: (text: string) => string = (line) => line): string[] {
  const prefixWidth = visibleWidth(prefix);
  const wrapped = wrapTextWithAnsi(text, Math.max(1, width - prefixWidth));
  return wrapped.map((line, i) => `${i === 0 ? prefix : " ".repeat(prefixWidth)}${style(line)}`);
}
