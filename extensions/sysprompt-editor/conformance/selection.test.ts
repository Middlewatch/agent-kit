import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { mock, test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SELECTION_TYPE, restoreSelection } from "../lib/selection.ts";
import { capturingStderr, fixture } from "./fixture.ts";

function pin(manager: SessionManager) {
  return restoreSelection(manager.getBranch());
}

test("independent session pins, durable initialization, model changes, and live shared contents", async () => {
  const a = await fixture({ template: "DEFAULT CORE" });
  writeFileSync(join(a.templatesDir, "voice.md"), "VOICE CORE");
  assert.match(await a.prompt(), /^DEFAULT CORE/);
  assert.ok(
    SessionManager.open(a.sessionManager.getSessionFile()!)
      .getBranch()
      .some((e) => e.type === "custom" && e.customType === SELECTION_TYPE),
  );
  writeFileSync(join(a.templatesDir, ".active"), "voice.md\n");
  const b = await fixture({ reuse: a });
  assert.match(await b.prompt(), /^VOICE CORE/);
  assert.match(await a.prompt(), /^DEFAULT CORE/);
  await a.session.prompt("/sysprompt switch voice.md");
  assert.equal(
    readFileSync(join(a.templatesDir, ".active"), "utf8"),
    "voice.md\n",
  );
  await a.session.setModel(a.models[1]!);
  assert.match(await a.prompt(), /^VOICE CORE/);
  writeFileSync(join(a.templatesDir, "voice.md"), "EDITED SHARED CORE");
  assert.match(await a.prompt(), /^EDITED SHARED CORE/);
  assert.match(await b.prompt(), /^EDITED SHARED CORE/);
  await a.session.prompt("/sysprompt switch default.md");
  assert.match(await b.prompt(), /^EDITED SHARED CORE/);
  assert.match(await a.prompt(), /^DEFAULT CORE/);
  for (const h of [a, b]) {
    assert.equal(
      h.session.messages.some((m) =>
        JSON.stringify(m).includes(SELECTION_TYPE),
      ),
      false,
    );
  }
});

test("resume, tree navigation, and fork follow the branch-point selection", async () => {
  const h = await fixture({ template: "ORIGINAL CORE" });
  await h.prompt();
  const originalBranch = h.sessionManager.getLeafId()!;
  writeFileSync(join(h.templatesDir, "voice.md"), "BRANCH VOICE");
  await h.session.prompt("/sysprompt switch voice.md");
  await h.prompt();
  const voiceBranch = h.sessionManager.getLeafId()!;
  const file = h.sessionManager.getSessionFile()!;
  h.session.dispose();
  const resumed = await fixture({
    reuse: h,
    sessionManager: SessionManager.open(file),
  });
  assert.match(await resumed.prompt(), /^BRANCH VOICE/);
  await resumed.session.navigateTree(originalBranch);
  assert.match(await resumed.prompt(), /^ORIGINAL CORE/);
  await resumed.session.navigateTree(voiceBranch);
  assert.match(await resumed.prompt(), /^BRANCH VOICE/);
  resumed.session.dispose();
  const forker = SessionManager.open(file);
  const forkFile = forker.createBranchedSession(originalBranch)!;
  assert.notEqual(forkFile, file);
  const fork = await fixture({
    reuse: h,
    sessionManager: SessionManager.open(forkFile),
  });
  assert.match(await fork.prompt(), /^ORIGINAL CORE/);
  assert.deepEqual(pin(fork.sessionManager), {
    kind: "selected",
    name: "default.md",
  });
});

test("a switch before the first reply is held in memory until the session file is written (stock Pi buffers custom entries)", async () => {
  // Documented limitation: stock Pi writes custom entries with the first
  // assistant message. Switching and then quitting before any reply leaves
  // no file, so the next session starts from the active pointer again.
  const h = await fixture({ template: "DEFAULT CORE" });
  writeFileSync(join(h.templatesDir, "voice.md"), "VOICE CORE");
  await h.session.prompt("/sysprompt switch voice.md");
  assert.deepEqual(pin(h.sessionManager), {
    kind: "selected",
    name: "voice.md",
  });
  assert.equal(existsSync(h.sessionManager.getSessionFile()!), false);
  assert.match(await h.prompt(), /^VOICE CORE/);
  assert.ok(
    SessionManager.open(h.sessionManager.getSessionFile()!)
      .getBranch()
      .some((e) => e.type === "custom" && e.customType === SELECTION_TYPE),
  );
});

test("missing selected file fails open visibly once, retains its name, and recovers when restored", async () => {
  const h = await fixture({ template: "PINNED CORE" });
  await h.prompt();
  rmSync(join(h.templatesDir, "default.md"));
  const { result, lines } = await capturingStderr(async () => [
    await h.prompt(),
    await h.prompt(),
  ]);
  for (const system of result)
    assert.match(system, /^You are an expert coding assistant/);
  assert.equal(
    lines.filter((text) =>
      text.includes("selected template default.md unavailable"),
    ).length,
    1,
  );
  assert.deepEqual(pin(h.sessionManager), {
    kind: "selected",
    name: "default.md",
  });
  writeFileSync(join(h.templatesDir, "default.md"), "RESTORED CORE");
  assert.match(await h.prompt(), /^RESTORED CORE/);
});

test("malformed saved selection fails open instead of guessing the old selection", async () => {
  const h = await fixture({ template: "OLD CORE" });
  await h.prompt();
  h.sessionManager.appendCustomEntry(SELECTION_TYPE, {
    version: 9,
    name: "default.md",
  });
  const { result, lines } = await capturingStderr(() => h.prompt());
  assert.match(result, /^You are an expert coding assistant/);
  assert.ok(
    lines.some((text) => text.includes("malformed saved template selection")),
  );
});

test("a failed switch write is reported as memory-only, and the session file keeps the old pin", async () => {
  // Stock Pi records the custom entry in memory before the write, so the
  // extension cannot undo the pin; it says so instead.
  const h = await fixture({ template: "OLD CORE" });
  await h.prompt();
  writeFileSync(join(h.templatesDir, "voice.md"), "NEW CORE");
  const file = h.sessionManager.getSessionFile()!;
  renameSync(file, file + ".saved");
  mkdirSync(file);
  try {
    const { lines } = await capturingStderr(() =>
      h.session.prompt("/sysprompt switch voice.md"),
    );
    assert.deepEqual(pin(h.sessionManager), {
      kind: "selected",
      name: "voice.md",
    });
    assert.ok(
      lines.some((text) =>
        text.includes("session template: voice.md in memory only"),
      ),
      lines.join(),
    );
  } finally {
    rmSync(file, { recursive: true });
    renameSync(file + ".saved", file);
  }
  assert.deepEqual(pin(SessionManager.open(file)), {
    kind: "selected",
    name: "default.md",
  });
});

test("failed initial persistence preserves incoming prompt and reports the failure", async () => {
  const h = await fixture({ template: "UNSAVED CORE" });
  const append = mock.method(h.sessionManager, "appendCustomEntry", () => {
    throw new Error("injected storage failure");
  });
  try {
    const { result, lines } = await capturingStderr(() => h.prompt());
    assert.match(result, /^You are an expert coding assistant/);
    assert.deepEqual(pin(h.sessionManager), { kind: "none" });
    assert.ok(
      lines.some((text) =>
        text.includes("initial selection could not be saved"),
      ),
    );
  } finally {
    append.mock.restore();
  }
  assert.match(await h.prompt(), /^UNSAVED CORE/);
});

test("interactive fallback warns on first occurrence and reason changes, then recovers", async () => {
  const notices: string[] = [];
  const h = await fixture({
    template: "CORE",
    notify: (message) => notices.push(message),
  });
  await h.prompt();
  rmSync(join(h.templatesDir, "default.md"));
  await h.prompt();
  await h.prompt();
  assert.equal(
    notices.filter((text) =>
      text.includes("selected template default.md unavailable"),
    ).length,
    1,
  );
  h.sessionManager.appendCustomEntry(SELECTION_TYPE, { version: 0 });
  await h.prompt();
  assert.equal(
    notices.filter((text) =>
      text.includes("malformed saved template selection"),
    ).length,
    1,
  );
  writeFileSync(join(h.templatesDir, "default.md"), "RESTORED");
  await h.session.prompt("/sysprompt switch default.md");
  assert.match(await h.prompt(), /^RESTORED/);
});
