import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SELECTION_TYPE, restoreSelection } from "../lib/selection.ts";
import { fixture } from "./fixture.ts";

function pin(manager: SessionManager) {
  return restoreSelection(manager.getBranch());
}

test("independent session pins, durable initialization, model changes, and live shared contents", async () => {
  const a = await fixture({ template: "DEFAULT CORE" });
  writeFileSync(join(a.templatesDir, "voice.md"), "VOICE CORE");
  expect(await a.prompt()).toMatch(/^DEFAULT CORE/);
  expect(
    SessionManager.open(a.sessionManager.getSessionFile()!)
      .getBranch()
      .some((e) => e.type === "custom" && e.customType === SELECTION_TYPE),
  ).toBe(true);
  writeFileSync(join(a.templatesDir, ".active"), "voice.md\n");
  const b = await fixture({ reuse: a });
  expect(await b.prompt()).toMatch(/^VOICE CORE/);
  expect(await a.prompt()).toMatch(/^DEFAULT CORE/);
  await a.session.prompt("/sysprompt switch voice.md");
  expect(readFileSync(join(a.templatesDir, ".active"), "utf8")).toBe(
    "voice.md\n",
  );
  await a.session.setModel(a.models[1]);
  expect(await a.prompt()).toMatch(/^VOICE CORE/);
  writeFileSync(join(a.templatesDir, "voice.md"), "EDITED SHARED CORE");
  expect(await a.prompt()).toMatch(/^EDITED SHARED CORE/);
  expect(await b.prompt()).toMatch(/^EDITED SHARED CORE/);
  await a.session.prompt("/sysprompt switch default.md");
  expect(await b.prompt()).toMatch(/^EDITED SHARED CORE/);
  expect(await a.prompt()).toMatch(/^DEFAULT CORE/);
  for (const h of [a, b]) {
    expect(
      h.session.messages.some((m) =>
        JSON.stringify(m).includes(SELECTION_TYPE),
      ),
    ).toBe(false);
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
  expect(await resumed.prompt()).toMatch(/^BRANCH VOICE/);
  await resumed.session.navigateTree(originalBranch);
  expect(await resumed.prompt()).toMatch(/^ORIGINAL CORE/);
  await resumed.session.navigateTree(voiceBranch);
  expect(await resumed.prompt()).toMatch(/^BRANCH VOICE/);
  resumed.session.dispose();
  const forker = SessionManager.open(file);
  const forkFile = forker.createBranchedSession(originalBranch)!;
  expect(forkFile).not.toBe(file);
  const fork = await fixture({
    reuse: h,
    sessionManager: SessionManager.open(forkFile),
  });
  expect(await fork.prompt()).toMatch(/^ORIGINAL CORE/);
  expect(pin(fork.sessionManager)).toEqual({
    kind: "selected",
    name: "default.md",
  });
});

test("missing selected file fails open visibly once, retains its name, and recovers when restored", async () => {
  const h = await fixture({ template: "PINNED CORE" });
  await h.prompt();
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    rmSync(join(h.templatesDir, "default.md"));
    expect(await h.prompt()).toMatch(/^You are an expert coding assistant/);
    expect(await h.prompt()).toMatch(/^You are an expert coding assistant/);
    expect(
      stderr.mock.calls.filter(([text]) =>
        String(text).includes("selected template default.md unavailable"),
      ),
    ).toHaveLength(1);
    expect(pin(h.sessionManager)).toEqual({
      kind: "selected",
      name: "default.md",
    });
    writeFileSync(join(h.templatesDir, "default.md"), "RESTORED CORE");
    expect(await h.prompt()).toMatch(/^RESTORED CORE/);
  } finally {
    stderr.mockRestore();
  }
});

test("malformed saved selection fails open instead of guessing the old selection", async () => {
  const h = await fixture({ template: "OLD CORE" });
  await h.prompt();
  h.sessionManager.appendCustomEntry(SELECTION_TYPE, {
    version: 9,
    name: "default.md",
  });
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    expect(await h.prompt()).toMatch(/^You are an expert coding assistant/);
    expect(
      stderr.mock.calls.some(([text]) =>
        String(text).includes("malformed saved template selection"),
      ),
    ).toBe(true);
  } finally {
    stderr.mockRestore();
  }
});

test("failed switch writes retain the previous branch and template", async () => {
  const h = await fixture({ template: "OLD CORE" });
  await h.prompt();
  writeFileSync(join(h.templatesDir, "voice.md"), "NEW CORE");
  const file = h.sessionManager.getSessionFile()!;
  const leaf = h.sessionManager.getLeafId();
  renameSync(file, file + ".saved");
  mkdirSync(file);
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    await h.session.prompt("/sysprompt switch voice.md");
    expect(h.sessionManager.getLeafId()).toBe(leaf);
    expect(pin(h.sessionManager)).toEqual({
      kind: "selected",
      name: "default.md",
    });
    expect(
      stderr.mock.calls.some(([text]) =>
        String(text).includes("template selection not changed"),
      ),
    ).toBe(true);
  } finally {
    stderr.mockRestore();
    rmSync(file, { recursive: true });
    renameSync(file + ".saved", file);
  }
  expect(await h.prompt()).toMatch(/^OLD CORE/);
});

test("failed initial persistence preserves incoming prompt and reports the failure", async () => {
  const h = await fixture({ template: "UNSAVED CORE" });
  const append = vi
    .spyOn(h.sessionManager, "appendCustomEntry")
    .mockImplementation(() => {
      throw new Error("injected storage failure");
    });
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    expect(await h.prompt()).toMatch(/^You are an expert coding assistant/);
    expect(pin(h.sessionManager)).toEqual({ kind: "none" });
    expect(
      stderr.mock.calls.some(([text]) =>
        String(text).includes("initial selection could not be saved"),
      ),
    ).toBe(true);
  } finally {
    append.mockRestore();
    stderr.mockRestore();
  }
  expect(await h.prompt()).toMatch(/^UNSAVED CORE/);
});

test("interactive fallback warns on first occurrence and reason changes, then recovers", async () => {
  const h = await fixture({ template: "CORE" });
  const notices: string[] = [];
  await h.session.bindExtensions({
    uiContext: { notify: (message: string) => notices.push(message) } as never,
  });
  await h.prompt();
  rmSync(join(h.templatesDir, "default.md"));
  await h.prompt();
  await h.prompt();
  expect(
    notices.filter((text) =>
      text.includes("selected template default.md unavailable"),
    ),
  ).toHaveLength(1);
  h.sessionManager.appendCustomEntry(SELECTION_TYPE, { version: 0 });
  await h.prompt();
  expect(
    notices.filter((text) =>
      text.includes("malformed saved template selection"),
    ),
  ).toHaveLength(1);
  writeFileSync(join(h.templatesDir, "default.md"), "RESTORED");
  await h.session.prompt("/sysprompt switch default.md");
  expect(await h.prompt()).toMatch(/^RESTORED/);
});
