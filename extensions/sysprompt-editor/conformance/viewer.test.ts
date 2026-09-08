import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  SessionManager,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/compat";
import { sha256 } from "../lib/evidence.ts";
import { fixture } from "./fixture.ts";

const LEGACY_TYPES = [
  "sysprompt-editor:request",
  "sysprompt-editor:request-card",
];
const themeModule = await import(
  new URL(
    "modes/interactive/theme/theme.js",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  ).href
);
themeModule.initTheme("dark", false);

function requests(manager: SessionManager) {
  return manager
    .getBranch()
    .filter(
      (entry) =>
        entry.type === "custom" && LEGACY_TYPES.includes(entry.customType),
    );
}

function viewerUI() {
  const screens: string[] = [];
  const notices: string[] = [];
  const choices: string[][] = [];
  let keys: string[] = ["2", "q"];
  const ui = {
    notify(message: string) {
      notices.push(message);
    },
    select: async (_title: string, options: string[]) => {
      choices.push(options);
      return options.includes("view") ? "view" : options.at(-1);
    },
    custom: (factory: Parameters<ExtensionUIContext["custom"]>[0]) =>
      new Promise((resolve) => {
        const component = factory(
          { terminal: { rows: 80 } } as never,
          themeModule.theme,
          {} as never,
          resolve,
        );
        assert.ok(!(component instanceof Promise));
        if (component instanceof Promise) return;
        screens.push(stripTerminalSequences(component.render(150).join("\n")));
        for (const key of keys) {
          component.handleInput?.(key);
          screens.push(
            stripTerminalSequences(component.render(150).join("\n")),
          );
        }
      }),
  };
  return {
    ui: ui as ExtensionUIContext,
    screens,
    notices,
    choices,
    setKeys: (next: string[]) => {
      keys = next;
    },
  };
}

test("view before the first request is a live-template preview with no selection writes or model calls", async () => {
  const ui = viewerUI();
  const h = await fixture({
    template: "FIRST CORE\n{{GLOBAL_INSTRUCTIONS}}",
    uiContext: ui.ui,
  });
  const before = h.sessionManager.getEntries();
  writeFileSync(
    join(h.templatesDir, "default.md"),
    "EDITED CORE\n{{GLOBAL_INSTRUCTIONS}}",
  );
  await h.session.prompt("/sysprompt view");
  assert.ok(
    ui.screens.some(
      (screen) =>
        screen.includes("Current preview (not sent)") &&
        screen.includes("EDITED CORE") &&
        screen.includes("GLOBAL OPAQUE"),
    ),
  );
  assert.deepEqual(h.sessionManager.getEntries(), before);
  assert.equal(h.finalPayloads.length, 0);
});

test("preview refuses an unpinned Pi reconstruction while leaving source inventory available", async () => {
  const ui = viewerUI();
  ui.setKeys(["2", "q"]);
  const h = await fixture({
    template: "UNVERIFIED CORE",
    piVersion: "0.0.0-drift",
    uiContext: ui.ui,
  });
  await h.session.prompt("/sysprompt view");
  assert.ok(ui.screens[0]?.includes("Preview unavailable"));
  assert.ok(!ui.screens[0]?.includes("UNVERIFIED CORE"));
  const sources = ui.screens.join("\n");
  assert.ok(sources.includes("AGENTS.md"));
  assert.ok(sources.includes("fallback-or-bypass: Preview unavailable"));
  assert.ok(sources.includes("core-source: stock"));
  assert.ok(sources.includes(`sha256:${sha256("GLOBAL OPAQUE\n")}`));
  assert.equal(h.finalPayloads.length, 0);
});

test("preview source evidence names and hashes the template it actually renders", async () => {
  const ui = viewerUI();
  ui.setKeys(["2", "q"]);
  const h = await fixture({ template: "PROVEN PREVIEW", uiContext: ui.ui });
  await h.session.prompt("/sysprompt view");
  const sources = ui.screens.join("\n");
  assert.ok(sources.includes("selected-template: default.md"));
  assert.ok(sources.includes("rendered-template: default.md"));
  assert.ok(sources.includes(`template-sha256: ${sha256("PROVEN PREVIEW")}`));
});

test("preview keeps a missing pin visible and reports the fallback", async () => {
  const ui = viewerUI();
  ui.setKeys(["2", "q"]);
  const h = await fixture({ uiContext: ui.ui });
  await h.prompt();
  unlinkSync(join(h.templatesDir, "default.md"));
  await h.session.prompt("/sysprompt view");
  const screens = ui.screens.join("\n");
  assert.ok(screens.includes("selected-template: default.md"));
  assert.ok(screens.includes("rendered-template: (incoming prompt)"));
  assert.ok(screens.includes("ENOENT"));
  assert.equal(h.finalPayloads.length, 1);
});

test("preview reports malformed selection and custom-core bypass without claiming a template render", async () => {
  for (const malformed of [false, true]) {
    const ui = viewerUI();
    ui.setKeys(["2", "q"]);
    const h = await fixture({
      customPrompt: "CUSTOM PREVIEW",
      uiContext: ui.ui,
    });
    if (malformed)
      h.sessionManager.appendCustomEntry("sysprompt-editor:selection", {
        version: 999,
      });
    await h.session.prompt("/sysprompt view");
    const screens = ui.screens.join("\n");
    assert.ok(screens.includes("CUSTOM PREVIEW"));
    assert.ok(screens.includes("rendered-template: (incoming prompt)"));
    assert.ok(!screens.includes("fallback-or-bypass: (none)"));
    if (!malformed) {
      assert.ok(screens.includes("selected-template: default.md"));
      assert.ok(screens.includes("custom Pi core bypasses the template"));
    }
    assert.equal(h.finalPayloads.length, 0);
  }
});

test("disposable menu inspection creates no captures, files, or provider requests", async () => {
  const ui = viewerUI();
  ui.setKeys(["2", "q"]);
  const h = await fixture({ template: "DISPOSABLE PREVIEW", uiContext: ui.ui });
  const entries = h.sessionManager.getEntries();
  assert.equal(existsSync(h.artifactsDir), false);
  await h.session.prompt("/sysprompt");
  assert.ok(ui.screens.some((screen) => screen.includes("DISPOSABLE PREVIEW")));
  assert.deepEqual(h.sessionManager.getEntries(), entries);
  assert.equal(h.finalPayloads.length, 0);
  assert.equal(existsSync(h.artifactsDir), false);
  h.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("read", { path: join(h.cwd, "AGENTS.md") }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("tool complete"),
  ]);
  await h.prompt();
  await h.prompt();
  assert.equal(
    requests(h.sessionManager).length,
    0,
    "ordinary turns and tool continuations must not store any request captures",
  );
  assert.equal(h.finalPayloads.length, 3);
  assert.deepEqual(
    h.sessionManager
      .getEntries()
      .flatMap((entry) => (entry.type === "custom" ? [entry.customType] : [])),
    ["sysprompt-editor:selection"],
  );
  for (const payload of h.finalPayloads) {
    assert.ok(!JSON.stringify(payload).includes("Current preview (not sent)"));
    assert.ok(!JSON.stringify(payload).includes("Preview rendering:"));
  }
  for (const type of LEGACY_TYPES)
    assert.equal(h.session.extensionRunner.getEntryRenderer(type), undefined);
  assert.equal(existsSync(h.artifactsDir), false);
});

test("resumed legacy captures stay untouched and do not replace the disposable preview", async () => {
  const h = await fixture();
  for (const type of LEGACY_TYPES)
    h.sessionManager.appendCustomEntry(type, {
      version: 1,
      kind: "captured",
      at: "earlier",
      provider: "fixture",
      modelId: "old",
      sources: "OLD SOURCES",
      json: '{"system":"LEGACY CAPTURE"}',
    });
  await h.prompt();
  const file = h.sessionManager.getSessionFile()!;
  h.session.dispose();
  const ui = viewerUI();
  const resumed = await fixture({
    reuse: h,
    sessionManager: SessionManager.open(file),
    uiContext: ui.ui,
  });
  writeFileSync(
    join(h.templatesDir, "default.md"),
    "CURRENT DISPOSABLE PREVIEW",
  );
  const entries = resumed.sessionManager.getEntries();
  await resumed.session.prompt("/sysprompt view");
  assert.ok(ui.screens[0]?.includes("CURRENT DISPOSABLE PREVIEW"));
  assert.ok(!ui.screens[0]?.includes("LEGACY CAPTURE"));
  assert.deepEqual(resumed.sessionManager.getEntries(), entries);
  for (const type of LEGACY_TYPES)
    assert.equal(
      resumed.session.extensionRunner.getEntryRenderer(type),
      undefined,
    );
  assert.equal(resumed.finalPayloads.length, 0);
});
