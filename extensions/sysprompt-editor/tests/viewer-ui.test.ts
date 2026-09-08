import assert from "node:assert/strict";
import test from "node:test";
import {
  stripTerminalSequences,
  visibleWidth,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { RequestBrowser, RequestCard } from "../lib/viewer-ui.ts";
import { captureRequest } from "../lib/viewer.ts";

const base = import.meta.resolve("@earendil-works/pi-coding-agent");
const themeModule = await import(
  new URL("modes/interactive/theme/theme.js", base).href
);
themeModule.initTheme("dark", false);
const { CustomEntryComponent } = await import(
  new URL("modes/interactive/components/custom-entry.js", base).href
);
const record = captureRequest(
  {
    system: "OPAQUE CORE\n\u001b[31mESCAPED\u001b[0m",
    messages: [{ role: "user", content: "QUESTION" }],
  },
  { provider: "fixture", id: "one" },
  "SOURCE",
  "now",
);
const click: TuiMouseEvent = {
  type: "click",
  button: "left",
  x: 0,
  y: 1,
  screenX: 0,
  screenY: 1,
  width: 80,
  height: 2,
  shift: false,
  alt: false,
  ctrl: false,
};
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));

test("real Pi custom entry dispatch expands, preserves state on invalidation, and collapses", () => {
  const card = new RequestCard(record, false, themeModule.theme);
  const component = new CustomEntryComponent(
    { type: "custom", id: "entry", data: record },
    (_entry: unknown, options: { expanded: boolean }) => {
      card.sync(options.expanded, themeModule.theme);
      return card;
    },
  );
  const collapsed = component.render(80);
  assert.doesNotMatch(plain(collapsed), /OPAQUE CORE/);
  assert.equal(component.handleMouse(click)?.handled, true);
  const expanded = component.render(80);
  assert.match(plain(expanded), /OPAQUE CORE/);
  assert.match(plain(expanded), /ESCAPED/);
  assert.ok(!expanded.join().includes("\u001b[31m"));
  component.invalidate();
  assert.match(plain(component.render(80)), /OPAQUE CORE/);
  component.handleMouse({ ...click, height: expanded.length });
  assert.doesNotMatch(plain(component.render(80)), /OPAQUE CORE/);
  component.setExpanded(true);
  assert.match(plain(component.render(80)), /OPAQUE CORE/);
  component.setExpanded(false);
  assert.doesNotMatch(plain(component.render(80)), /OPAQUE CORE/);
});

test("browser scrolls with keys and wheel, changes sections, handles resize, and closes", () => {
  let height = 10;
  const actions: string[] = [];
  const long = captureRequest(
    {
      system: Array.from({ length: 50 }, (_, i) => `LINE ${i}`).join("\n"),
      tools: [{ name: "PROBE" }],
    },
    undefined,
    "SOURCE",
    "now",
  );
  const browser = new RequestBrowser(
    long,
    themeModule.theme,
    () => height,
    (action) => actions.push(action),
  );
  assert.match(plain(browser.render(80)), /LINE 0/);
  browser.handleInput("\u001b[F");
  assert.match(plain(browser.render(80)), /LINE 49/);
  browser.handleMouse({ ...click, type: "wheel", wheelDelta: -3 });
  assert.doesNotMatch(plain(browser.render(80)), /LINE 49/);
  browser.handleInput("4");
  assert.match(plain(browser.render(80)), /PROBE/);
  for (const width of [20, 40, 100]) {
    height = 8;
    const lines = browser.render(width);
    assert.ok(lines.length <= height);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
  browser.handleInput("h");
  browser.handleInput("p");
  browser.handleInput("\u001b");
  assert.deepEqual(actions, ["history", "preview", "close"]);
});
