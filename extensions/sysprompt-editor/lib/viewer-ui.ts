import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  stripTerminalSequences,
  Text,
  truncateToWidth,
  type Component,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
export interface PromptPreview {
  instructions: string;
  sources: string;
}
const SECTIONS = ["instructions", "sources"] as const;
export const PREVIEW_BOUNDARY =
  "Current preview, not a captured request. Uses Pi's currently loaded inputs and the live selected template. Per-turn extension and provider changes are absent. Reload Pi to refresh loaded instruction files.";

// Instruction files may contain terminal control sequences.
function terminalText(text: string): string {
  return stripTerminalSequences(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** A bounded viewport works in both regular and fullscreen custom overlays. */
export class PromptViewer implements Component {
  private theme: Theme;
  private height: () => number;
  private done: () => void;
  private section: keyof PromptPreview = "instructions";
  private sections: PromptPreview;
  private offset = 0;
  private body: { width: number; lines: string[] } | null = null;
  private pageHeight = 1;
  private maxOffset = 0;

  constructor(
    preview: PromptPreview,
    theme: Theme,
    height: () => number,
    done: () => void,
  ) {
    this.theme = theme;
    this.height = height;
    this.done = done;
    this.sections = preview;
  }

  invalidate(): void {
    this.body = null;
  }

  private move(lines: number): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset + lines));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") return this.done();
    const index = SECTIONS.indexOf(this.section);
    const chosen = /^[1-2]$/.test(data)
      ? Number(data) - 1
      : matchesKey(data, Key.tab) || matchesKey(data, Key.right)
        ? (index + 1) % SECTIONS.length
        : matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)
          ? (index + SECTIONS.length - 1) % SECTIONS.length
          : -1;
    const next = SECTIONS[chosen];
    if (next) {
      this.section = next;
      this.offset = 0;
      this.invalidate();
    } else if (matchesKey(data, Key.down) || data === "j") this.move(1);
    else if (matchesKey(data, Key.up) || data === "k") this.move(-1);
    else if (matchesKey(data, Key.pageDown)) this.move(this.pageHeight);
    else if (matchesKey(data, Key.pageUp)) this.move(-this.pageHeight);
    else if (matchesKey(data, Key.home)) this.offset = 0;
    else if (matchesKey(data, Key.end)) this.offset = this.maxOffset;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "wheel") return;
    this.move(event.wheelDelta ?? 0);
    return { handled: true };
  }

  render(width: number): string[] {
    const height = Math.max(1, this.height());
    this.pageHeight = Math.max(1, height - 4);
    if (this.body?.width !== width) {
      const text = new Text(terminalText(this.sections[this.section]), 0, 0);
      this.body = { width, lines: text.render(width) };
    }
    const body = this.body.lines;
    this.maxOffset = Math.max(0, body.length - this.pageHeight);
    this.offset = Math.min(this.offset, this.maxOffset);
    const clip = (text: string) => truncateToWidth(terminalText(text), width);
    const title = this.theme.fg("accent", clip("Current preview (not sent)"));
    const boundary = this.theme.fg(
      "dim",
      clip("PREVIEW · not sent · loaded Pi inputs + live template"),
    );
    const tabs = SECTIONS.map(
      (name, i) => `${i + 1} ${name === this.section ? `[${name}]` : name}`,
    ).join("  ");
    const lines = [
      title,
      boundary,
      this.theme.fg("muted", clip(tabs)),
      ...body.slice(this.offset, this.offset + this.pageHeight),
    ];
    while (lines.length < height - 1) lines.push("");
    lines.push(
      this.theme.fg(
        "dim",
        clip(
          `↑↓/PgUp/PgDn scroll · Tab section · Esc close · ${this.offset + 1}/${body.length}`,
        ),
      ),
    );
    return lines.slice(0, height);
  }
}
