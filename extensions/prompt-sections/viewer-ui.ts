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
/** What the overlay shows: a title, a one-line statement of where the text came from, and named tabs. */
export interface PromptView {
  title: string;
  boundary: string;
  tabs: { name: string; text: string }[];
}

// Instruction files may contain terminal control sequences.
function terminalText(text: string): string {
  return stripTerminalSequences(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** A bounded viewport works in both regular and fullscreen custom overlays. */
export class PromptViewer implements Component {
  private theme: Theme;
  private height: () => number;
  private done: () => void;
  private tab = 0;
  private view: PromptView;
  private offset = 0;
  private body: { width: number; lines: string[] } | null = null;
  private pageHeight = 1;
  private maxOffset = 0;

  constructor(
    view: PromptView,
    theme: Theme,
    height: () => number,
    done: () => void,
  ) {
    this.theme = theme;
    this.height = height;
    this.done = done;
    this.view = view;
  }

  invalidate(): void {
    this.body = null;
  }

  private move(lines: number): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset + lines));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") return this.done();
    const count = this.view.tabs.length;
    const chosen = /^[1-9]$/.test(data)
      ? Number(data) - 1
      : matchesKey(data, Key.tab) || matchesKey(data, Key.right)
        ? (this.tab + 1) % count
        : matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)
          ? (this.tab + count - 1) % count
          : -1;
    if (chosen >= 0 && chosen < count) {
      this.tab = chosen;
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
      const text = new Text(terminalText(this.view.tabs[this.tab].text), 0, 0);
      this.body = { width, lines: text.render(width) };
    }
    const body = this.body.lines;
    this.maxOffset = Math.max(0, body.length - this.pageHeight);
    this.offset = Math.min(this.offset, this.maxOffset);
    const clip = (text: string) => truncateToWidth(terminalText(text), width);
    const title = this.theme.fg("accent", clip(this.view.title));
    const boundary = this.theme.fg("dim", clip(this.view.boundary));
    const tabs = this.view.tabs
      .map(({ name }, i) => `${i + 1} ${i === this.tab ? `[${name}]` : name}`)
      .join("  ");
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
          `↑↓/PgUp/PgDn scroll · Tab next · Esc close · ${this.offset + 1}/${body.length}`,
        ),
      ),
    );
    return lines.slice(0, height);
  }
}
