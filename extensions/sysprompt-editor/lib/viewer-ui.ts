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
import {
  CAPTURE_BOUNDARY,
  PREVIEW_BOUNDARY,
  SECTIONS,
  requestSections,
  requestTitle,
  type Section,
  type ViewRecord,
} from "./viewer.ts";

// Payloads are untrusted terminal content. Saved JSON remains untouched.
function terminalText(text: string): string {
  return stripTerminalSequences(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export class RequestCard implements Component {
  private record: ViewRecord;
  private theme: Theme;
  private expanded: boolean;
  private globalExpanded: boolean;
  private cache: { width: number; lines: string[] } | null = null;

  constructor(record: ViewRecord, expanded: boolean, theme: Theme) {
    this.record = record;
    this.theme = theme;
    this.expanded = this.globalExpanded = expanded;
  }

  sync(expanded: boolean, theme: Theme): void {
    this.theme = theme;
    if (expanded !== this.globalExpanded) {
      this.globalExpanded = expanded;
      this.expanded = expanded;
    }
    this.invalidate();
  }

  invalidate(): void {
    this.cache = null;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left" || event.y !== 0)
      return;
    this.expanded = !this.expanded;
    this.invalidate();
    return { handled: true };
  }

  render(width: number): string[] {
    if (this.cache?.width === width) return this.cache.lines;
    const title = `${this.expanded ? "▾" : "▸"} ${requestTitle(this.record)}`;
    const lines = [
      this.theme.fg("accent", truncateToWidth(terminalText(title), width)),
    ];
    if (this.expanded) {
      const sections = requestSections(this.record);
      const boundary =
        this.record.kind === "preview" ? PREVIEW_BOUNDARY : CAPTURE_BOUNDARY;
      lines.push(
        ...new Text(
          terminalText(
            `${boundary}\n\n${sections.instructions}\n\n/sysprompt view opens sources, messages, tools and raw payload. The header collapses this card.`,
          ),
          1,
          0,
        ).render(width),
      );
    }
    this.cache = { width, lines };
    return lines;
  }
}

export type ViewerAction = "close" | "history" | "preview";

/** A bounded viewport works in both regular and fullscreen custom overlays. */
export class RequestBrowser implements Component {
  private record: ViewRecord;
  private theme: Theme;
  private height: () => number;
  private done: (action: ViewerAction) => void;
  private section: Section = "instructions";
  private sections: Record<Section, string>;
  private offset = 0;
  private body: { width: number; lines: string[] } | null = null;
  private pageHeight = 1;
  private maxOffset = 0;

  constructor(
    record: ViewRecord,
    theme: Theme,
    height: () => number,
    done: (action: ViewerAction) => void,
  ) {
    this.record = record;
    this.theme = theme;
    this.height = height;
    this.done = done;
    this.sections = requestSections(record);
  }

  invalidate(): void {
    this.body = null;
  }

  private move(lines: number): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset + lines));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") return this.done("close");
    if (data === "h") return this.done("history");
    if (data === "p") return this.done("preview");
    const index = SECTIONS.indexOf(this.section);
    const chosen = /^[1-5]$/.test(data)
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
    const title = this.theme.fg("accent", clip(requestTitle(this.record)));
    const boundary = this.theme.fg(
      "dim",
      clip(
        this.record.kind === "preview"
          ? "PREVIEW · not sent · loaded Pi inputs + live template"
          : "OBSERVATION · inspection hook, not a wire receipt",
      ),
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
          `↑↓/PgUp/PgDn scroll · Tab section · h history · p preview · Esc close · ${this.offset + 1}/${body.length}`,
        ),
      ),
    );
    return lines.slice(0, height);
  }
}
