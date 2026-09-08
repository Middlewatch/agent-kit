import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
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
  streamSimple,
} from "@earendil-works/pi-ai/compat";
import { REQUEST_TYPE, parseRequest } from "../lib/viewer.ts";
import { fixture } from "./fixture.ts";

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
    .flatMap((entry) =>
      entry.type === "custom" && entry.customType === REQUEST_TYPE
        ? [parseRequest(entry.data)]
        : [],
    );
}

function viewerUI() {
  const screens: string[] = [];
  const notices: string[] = [];
  const choices: string[][] = [];
  let keys: string[] = ["5", "q"];
  const ui = {
    notify(message: string) {
      notices.push(message);
    },
    select: async (_title: string, options: string[]) => {
      choices.push(options);
      return options.at(-1);
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

test("every observation is detached, durable, and excluded from subsequent model context", async () => {
  const h = await fixture({ additions: true });
  await h.prompt();
  await h.prompt();
  const saved = requests(h.sessionManager);
  assert.equal(saved.length, h.payloads.length);
  saved.forEach((record, index) => {
    assert.equal(record?.kind, "captured");
    if (record?.kind !== "captured") return;
    assert.deepEqual(JSON.parse(record.json), h.payloads[index]);
    assert.match(record.json, /LATER ADDITION/);
    assert.match(record.sources, /AGENTS.md/);
  });
  assert.deepEqual(
    requests(SessionManager.open(h.sessionManager.getSessionFile()!)),
    saved,
  );
  for (const payload of h.finalPayloads) {
    assert.equal(JSON.stringify(payload).includes(REQUEST_TYPE), false);
    assert.equal(
      JSON.stringify(payload).includes("Loaded-source inventory"),
      false,
    );
  }
});

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

test("on-demand view opens the latest request and history can reopen an older one after resume", async () => {
  const h = await fixture({ template: "OLD CORE" });
  await h.prompt();
  const firstLeaf = h.sessionManager.getLeafId()!;
  writeFileSync(join(h.templatesDir, "default.md"), "NEW CORE");
  await h.prompt();
  const file = h.sessionManager.getSessionFile()!;
  h.session.dispose();
  const ui = viewerUI();
  const resumed = await fixture({
    reuse: h,
    sessionManager: SessionManager.open(file),
    uiContext: ui.ui,
  });
  await resumed.session.prompt("/sysprompt view");
  assert.ok(ui.screens[0]?.includes("NEW CORE"));
  await resumed.session.prompt("/sysprompt view history");
  assert.ok(ui.screens.some((screen) => screen.includes("OLD CORE")));
  assert.equal(
    ui.choices[0]?.length,
    requests(resumed.sessionManager).length + 1,
  );
  assert.equal(resumed.finalPayloads.length, 0);
  const manager = SessionManager.open(file);
  manager.branch(firstLeaf);
  const older = requests(manager);
  assert.ok(older.length > 0);
  assert.ok(
    older.every(
      (record) =>
        record?.kind === "captured" && !record.json.includes("NEW CORE"),
    ),
  );
  const forkFile = manager.createBranchedSession(firstLeaf)!;
  assert.deepEqual(requests(SessionManager.open(forkFile)), older);
});

test("later provider mutation cannot change a saved observation", async () => {
  const h = await fixture();
  await h.prompt();
  const snapshot = requests(h.sessionManager)[0];
  assert.equal(snapshot?.kind, "captured");
  if (snapshot?.kind !== "captured") return;
  const stored = snapshot.json;
  (h.finalPayloads[0] as { system: string }).system = "DOWNSTREAM MUTATION";
  assert.equal(requests(h.sessionManager)[0]?.kind, "captured");
  assert.equal(snapshot.json, stored);
  assert.match(snapshot.sources, /Later handlers/);
});

test("tool continuations get their own captured request", async () => {
  const h = await fixture();
  h.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("read", { path: join(h.cwd, "AGENTS.md") }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("read complete"),
  ]);
  await h.prompt();
  const saved = requests(h.sessionManager);
  assert.equal(saved.length, 2);
  assert.ok(
    saved[1]?.kind === "captured" && saved[1].json.includes("toolResult"),
  );
});

test("a provider that skips onPayload records unavailable instead of displaying an older request as current", async () => {
  const h = await fixture();
  await h.prompt();
  h.session.agent.streamFunction = (model, context, options) =>
    streamSimple(model, context, { ...options, onPayload: undefined });
  await h.session.prompt("uncaptured");
  const saved = requests(h.sessionManager);
  assert.equal(saved[0]?.kind, "captured");
  assert.equal(saved.at(-1)?.kind, "unavailable");
});

test("snapshot storage failure does not stop or replace the provider request", async () => {
  const notices: string[] = [];
  const h = await fixture({
    template: "CAPTURE STORAGE PROBE",
    notify: (message) => notices.push(message),
  });
  const append = h.sessionManager.appendCustomEntry.bind(h.sessionManager);
  h.sessionManager.appendCustomEntry = (type, data) => {
    if (type === REQUEST_TYPE) throw new Error("disk failure");
    return append(type, data);
  };
  const prompt = await h.prompt();
  assert.ok(prompt.startsWith("CAPTURE STORAGE PROBE"));
  assert.equal(h.finalPayloads.length, 1);
  assert.match(notices.join("\n"), /capture could not be saved/);
});
