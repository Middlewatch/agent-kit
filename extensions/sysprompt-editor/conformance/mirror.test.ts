/**
 * The stock mirror against the published builder. A Pi release that changes
 * the core prose or the guideline rules goes red here; the runtime fails
 * open until `lib/stock-core.ts` is re-pinned.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VERSION,
  getDocsPath,
  getExamplesPath,
  getReadmePath,
} from "@earendil-works/pi-coding-agent";
import {
  PINNED_PI_VERSION,
  projectContext,
  stockCore,
} from "../lib/stock-core.ts";

// The builder is internal to the package; reach it by file, not by specifier.
const entryUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
assert.match(
  entryUrl,
  /\/dist\/index\.js$/,
  "package entry moved; update the builder path below",
);
const builderUrl = entryUrl.replace(/index\.js$/, "core/system-prompt.js");
const { buildSystemPrompt } = (await import(builderUrl)) as {
  buildSystemPrompt: (options: Record<string, unknown>) => string;
};

const paths = {
  readme: getReadmePath(),
  docs: getDocsPath(),
  examples: getExamplesPath(),
};

test("the pinned version names the installed package", () => {
  assert.equal(VERSION, PINNED_PI_VERSION);
});

const cases: Record<string, unknown>[] = [
  {},
  { toolSnippets: { read: "Read", bash: "Bash" } },
  {
    selectedTools: ["read", "bash", "grep", "find", "ls"],
    toolSnippets: { grep: "G" },
  },
  { selectedTools: ["powershell"], toolSnippets: { powershell: "PS" } },
  { selectedTools: ["bash", "powershell"] },
  { selectedTools: ["read"], promptGuidelines: [" one ", "", "two", "one"] },
  { promptGuidelines: ["Be concise in your responses"] },
];

for (const [index, inputs] of cases.entries()) {
  test(`stockCore equals buildSystemPrompt, case ${index}`, () => {
    assert.equal(
      stockCore(inputs, paths),
      buildSystemPrompt({ cwd: "/tmp", ...inputs }).replace(
        /\nCurrent working directory: \/tmp$/,
        "",
      ),
    );
  });
}

test("projectContext equals Pi's appended container", () => {
  const contextFiles = [
    { path: "/g/AGENTS.md", content: "one" },
    { path: "/w/AGENTS.md", content: "two\n" },
  ];
  const withFiles = buildSystemPrompt({ cwd: "/tmp", contextFiles });
  const without = buildSystemPrompt({ cwd: "/tmp" });
  const suffix = "\nCurrent working directory: /tmp";
  assert.equal(
    withFiles.slice(0, -suffix.length),
    without.slice(0, -suffix.length) + projectContext(contextFiles),
  );
});
