import assert from "node:assert/strict";
import test from "node:test";
import {
  stripTerminalSequences,
  visibleWidth,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { PromptViewer } from "../lib/viewer-ui.ts";

const themeModule = await import(
  new URL(
    "modes/interactive/theme/theme.js",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  ).href
);
themeModule.initTheme("dark", false);
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));

test("preview scrolls, changes source view, handles resize, and closes", () => {
  let height = 10;
  let closed = 0;
  const browser = new PromptViewer(
    {
      instructions: Array.from({ length: 50 }, (_, i) => `LINE ${i}`).join(
        "\n",
      ),
      sources: "SOURCE INVENTORY",
    },
    themeModule.theme,
    () => height,
    () => {
      closed++;
    },
  );
  assert.match(plain(browser.render(80)), /LINE 0/);
  browser.handleInput("\u001b[F");
  assert.match(plain(browser.render(80)), /LINE 49/);
  const wheel: TuiMouseEvent = {
    type: "wheel",
    button: "none",
    wheelDelta: -3,
    x: 0,
    y: 1,
    screenX: 0,
    screenY: 1,
    width: 80,
    height,
    shift: false,
    alt: false,
    ctrl: false,
  };
  browser.handleMouse(wheel);
  assert.doesNotMatch(plain(browser.render(80)), /LINE 49/);
  browser.handleInput("2");
  assert.match(plain(browser.render(80)), /SOURCE INVENTORY/);
  browser.handleInput("\t");
  assert.match(plain(browser.render(80)), /LINE 0/);
  for (const rows of [1, 4, 8]) {
    height = rows;
    for (const width of [1, 20, 40, 100]) {
      const lines = browser.render(width);
      assert.ok(lines.length <= height);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
    }
  }
  browser.handleInput("h");
  browser.handleInput("p");
  assert.equal(closed, 0);
  browser.handleInput("\u001b");
  assert.equal(closed, 1);
});

test("preview removes terminal control sequences for display without modifying inputs", () => {
  const instructions = "OPAQUE CORE\n\u001b[31mESCAPED\u001b[0m";
  const preview = { instructions, sources: "SOURCE" };
  const browser = new PromptViewer(
    preview,
    themeModule.theme,
    () => 10,
    () => {},
  );
  const rendered = browser.render(80).join("\n");
  assert.match(stripTerminalSequences(rendered), /OPAQUE CORE *\nESCAPED/);
  assert.ok(!rendered.includes("\u001b[31m"));
  assert.equal(preview.instructions, instructions);
});
