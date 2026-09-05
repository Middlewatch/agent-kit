/**
 * The stock mirror against literals taken from Pi's source, not from the
 * mirror itself. The conformance suite checks the same mirror against the
 * published builder.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  projectContext,
  scopeFiles,
  stockCore,
  STOCK_FIRST_LINE,
} from "../lib/stock-core.ts";

const PATHS = { readme: "/p/README.md", docs: "/p/docs", examples: "/p/ex" };

test("stockCore mirrors Pi's default tool set, bash guideline, and docs block", () => {
  const core = stockCore(
    { toolSnippets: { read: "Read a file", bash: "Run a command" } },
    PATHS,
  );
  assert.ok(core.startsWith(`${STOCK_FIRST_LINE} You help users`));
  assert.ok(
    core.includes(
      "Available tools:\n- read: Read a file\n- bash: Run a command\n\nIn addition",
    ),
  );
  assert.ok(
    core.includes(
      "Guidelines:\n- Use bash for file operations like ls, rg, find\n- Be concise in your responses\n- Show file paths clearly when working with files\n\nPi documentation (",
    ),
  );
  assert.ok(
    core.includes(
      "- Main documentation: /p/README.md\n- Additional docs: /p/docs\n- Examples: /p/ex (extensions, custom tools, SDK)\n",
    ),
  );
  assert.ok(core.endsWith("(e.g., tui.md for TUI API details)"));
});

test("stockCore follows Pi's tool-dependent guideline rules and de-duplication", () => {
  const withGrep = stockCore(
    { selectedTools: ["bash", "grep"], toolSnippets: {} },
    PATHS,
  );
  assert.ok(withGrep.includes("Available tools:\n(none)\n"));
  assert.ok(!withGrep.includes("Use bash for file operations"));
  const powershell = stockCore(
    { selectedTools: ["powershell"], toolSnippets: { powershell: "PS" } },
    PATHS,
  );
  assert.ok(
    powershell.includes(
      "- Use PowerShell for file operations like listing, searching, and finding files",
    ),
  );
  const both = stockCore({ selectedTools: ["bash", "powershell"] }, PATHS);
  assert.ok(
    both.includes(
      "- Use bash or PowerShell for file operations like listing, searching, and finding files",
    ),
  );
  const extra = stockCore(
    {
      promptGuidelines: [
        "  Custom rule  ",
        "",
        "Be concise in your responses",
        "Custom rule",
      ],
    },
    PATHS,
  );
  assert.ok(
    extra.includes(
      "Guidelines:\n- Use bash for file operations like ls, rg, find\n- Custom rule\n- Be concise in your responses\n- Show file paths clearly when working with files\n\n",
    ),
  );
});

test("projectContext reproduces Pi's container bytes and is empty with no files", () => {
  assert.equal(projectContext([]), "");
  assert.equal(
    projectContext([
      { path: "/g/AGENTS.md", content: "one" },
      { path: "/w/AGENTS.md", content: "two\n" },
    ]),
    "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n" +
      '<project_instructions path="/g/AGENTS.md">\none\n</project_instructions>\n\n' +
      '<project_instructions path="/w/AGENTS.md">\ntwo\n\n</project_instructions>\n\n' +
      "</project_context>\n",
  );
});

test("scopeFiles marks the agent-directory file global and every other file by its directory", () => {
  const scoped = scopeFiles(
    [
      { path: "/srv/u/.pi/agent/AGENTS.md", content: "g" },
      { path: "/srv/u/repo/AGENTS.md", content: "r" },
      { path: "/srv/u/repo/sub/CLAUDE.md", content: "s" },
    ],
    "/srv/u/.pi/agent/",
  );
  assert.deepEqual(scoped, [
    {
      path: "/srv/u/.pi/agent/AGENTS.md",
      content: "g",
      scope: { kind: "global" },
    },
    {
      path: "/srv/u/repo/AGENTS.md",
      content: "r",
      scope: { kind: "workspace", directory: "/srv/u/repo" },
    },
    {
      path: "/srv/u/repo/sub/CLAUDE.md",
      content: "s",
      scope: { kind: "workspace", directory: "/srv/u/repo/sub" },
    },
  ]);
});
