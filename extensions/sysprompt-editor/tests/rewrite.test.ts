/**
 * Unit tests for the template splice. A stub ExtensionAPI captures the
 * before_agent_start handler; a synthetic stock prompt exercises the rewrite
 * and each fail-open branch through the index.ts composition, and two tests
 * drive lib/splice.ts renderTemplate directly. No Pi process and no provider
 * request.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import systemPromptExtension from "../index.ts";
import { renderTemplate, scratchpadSection } from "../lib/splice.ts";

const TOOLS = "- read: Read file contents\n- bash: Execute bash commands";
const GUIDELINES =
  "- Use bash for file operations\n- Be concise in your responses";
const DOCS =
  "Pi documentation (read only when the user asks about pi itself):\n- Main documentation: /tmp/README.md";
const TAIL =
  "\n\n<project_context>\nstub\n</project_context>\n\nCurrent working directory: /tmp";

const STOCK_CORE =
  "You are an expert coding assistant operating inside pi, a coding agent harness. " +
  "You help users by reading files, executing commands, editing code, and writing new files.\n\n" +
  `Available tools:\n${TOOLS}\n\n` +
  "In addition to the tools above, you may have access to other custom tools depending on the project.\n\n" +
  `Guidelines:\n${GUIDELINES}\n\n` +
  DOCS;

/**
 * A temp templates dir holding only the repo's default.md, so the rewrite
 * under test does not depend on the gitignored `.active` pointer in the
 * live templates directory.
 */
const DEFAULT_TEMPLATE = fs.readFileSync(
  new URL("../../../guidance/sysprompt/default.md", import.meta.url),
  "utf8",
);
const TEMPLATES_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "sysprompt-rewrite-"),
);
fs.writeFileSync(path.join(TEMPLATES_DIR, "default.md"), DEFAULT_TEMPLATE);

function capturedHandler(): (
  event: unknown,
) => Promise<{ systemPrompt: string } | undefined> {
  let handler: unknown;
  const stub = {
    on(name: string, fn: unknown) {
      if (name === "before_agent_start") handler = fn;
    },
    registerCommand() {},
  };
  systemPromptExtension(stub as never, { templatesDir: TEMPLATES_DIR });
  assert.ok(handler, "extension registered a before_agent_start handler");
  return handler as (
    event: unknown,
  ) => Promise<{ systemPrompt: string } | undefined>;
}

test("stock prompt is rebuilt from the template with the tail preserved", async () => {
  const result = await capturedHandler()({ systemPrompt: STOCK_CORE + TAIL });
  assert.ok(result, "handler returned a rewritten prompt");
  const expected =
    DEFAULT_TEMPLATE.replaceAll("{{AVAILABLE_TOOLS}}", TOOLS)
      .replaceAll("{{GUIDELINES}}", GUIDELINES)
      .replaceAll("{{PI_DOCS}}", DOCS)
      .replaceAll(
        "{{PI_SCRATCHPAD}}",
        scratchpadSection(process.env.PI_SCRATCHPAD),
      )
      .trimEnd() + TAIL;
  assert.equal(result.systemPrompt, expected);
  // The tail split also honours the skills-only and cwd-only shapes.
  const rendered = expected.slice(0, -TAIL.length);
  for (const tail of [
    "\n<available_skills>\n  <skill>x</skill>\n</available_skills>\nCurrent working directory: /tmp",
    "\nCurrent working directory: /tmp",
  ]) {
    const r = await capturedHandler()({ systemPrompt: STOCK_CORE + tail });
    assert.equal(r?.systemPrompt, rendered + tail);
  }
});

test("an active SYSTEM.md custom prompt is left untouched", async () => {
  const result = await capturedHandler()({
    systemPrompt: STOCK_CORE + TAIL,
    systemPromptOptions: { customPrompt: "owner prompt" },
  });
  assert.equal(result, undefined);
});

test("a non-stock prompt is left untouched", async () => {
  const result = await capturedHandler()({
    systemPrompt: "Different first line." + TAIL,
  });
  assert.equal(result, undefined);
});

test("a drifted core shape fails open", async () => {
  const drifted = STOCK_CORE.replace("Guidelines:", "House rules:");
  const result = await capturedHandler()({ systemPrompt: drifted + TAIL });
  assert.equal(result, undefined);
});

test("renderTemplate replaces all three placeholders", () => {
  const template =
    "Intro.\n\nTools:\n{{AVAILABLE_TOOLS}}\n\nRules:\n{{GUIDELINES}}\n\n{{PI_DOCS}}\n\n";
  const rendered = renderTemplate(template, STOCK_CORE);
  assert.equal(
    rendered,
    `Intro.\n\nTools:\n${TOOLS}\n\nRules:\n${GUIDELINES}\n\n${DOCS}`,
  );
  // Placeholders are optional: an absent placeholder no-ops.
  assert.equal(renderTemplate("Only prose.", STOCK_CORE), "Only prose.");
});

test("renderTemplate fills {{PI_SCRATCHPAD}} from the given path, empty when unset", () => {
  const template = "Intro.\n\n## Scratchpad\n\n{{PI_SCRATCHPAD}}\n";
  const withPath = renderTemplate(template, STOCK_CORE, "/tmp/pad/abc");
  assert.ok(
    withPath?.includes("- `/tmp/pad/abc` (also `$PI_SCRATCHPAD` in bash)"),
  );
  assert.ok(withPath?.includes("deleted after a period of disuse."));
  assert.equal(renderTemplate(template, STOCK_CORE), "Intro.\n\n## Scratchpad");
  assert.equal(
    renderTemplate(template, STOCK_CORE, ""),
    "Intro.\n\n## Scratchpad",
  );
});

test("the handler passes process.env.PI_SCRATCHPAD into the render", async () => {
  const prior = process.env.PI_SCRATCHPAD;
  process.env.PI_SCRATCHPAD = "/tmp/pad/live";
  try {
    const result = await capturedHandler()({ systemPrompt: STOCK_CORE + TAIL });
    assert.ok(
      result?.systemPrompt.includes(
        "- `/tmp/pad/live` (also `$PI_SCRATCHPAD` in bash)",
      ),
    );
  } finally {
    if (prior === undefined) delete process.env.PI_SCRATCHPAD;
    else process.env.PI_SCRATCHPAD = prior;
  }
});

test("renderTemplate returns null on drifted shape", () => {
  const template = "{{AVAILABLE_TOOLS}}\n{{GUIDELINES}}\n{{PI_DOCS}}";
  assert.equal(
    renderTemplate(template, STOCK_CORE.replace("Guidelines:", "Rules:")),
    null,
  );
  assert.equal(
    renderTemplate(template, STOCK_CORE.replace("Available tools:", "Tools:")),
    null,
  );
  assert.equal(
    renderTemplate(
      template,
      STOCK_CORE.replace("Pi documentation (", "Pi docs ("),
    ),
    null,
  );
});

test("{{SKILLS}} relocates pi's stock skills block into the template", async () => {
  const block =
    "The following skills provide specialized instructions for specific tasks.\n" +
    "Use the read tool to load a skill's file when the task matches its description.\n\n" +
    "<available_skills>\n  <skill>\n    <name>harvest</name>\n  </skill>\n</available_skills>";
  const tail =
    "\n\n<project_context>ctx</project_context>\n\n" +
    block +
    "\nCurrent working directory: /w";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-skills-"));
  fs.writeFileSync(
    path.join(dir, "default.md"),
    "Intro.\n\n## Tools\n\n{{AVAILABLE_TOOLS}}\n\n## Skills\n\n{{SKILLS}}\n\n## Rules\n\n{{GUIDELINES}}\n\n{{PI_DOCS}}\n",
  );
  let handler: any;
  systemPromptExtension(
    {
      on(name: string, fn: unknown) {
        if (name === "before_agent_start") handler = fn;
      },
      registerCommand() {},
    } as never,
    { templatesDir: dir },
  );
  const result = await handler({ systemPrompt: STOCK_CORE + tail });
  assert.equal(
    result?.systemPrompt,
    `Intro.\n\n## Tools\n\n${TOOLS}\n\n## Skills\n\n${block}\n\n## Rules\n\n${GUIDELINES}\n\n${DOCS}` +
      "\n\n<project_context>ctx</project_context>\nCurrent working directory: /w",
  );
  // No skills block in the tail: the placeholder renders empty.
  const bare = await handler({
    systemPrompt: STOCK_CORE + "\nCurrent working directory: /w",
  });
  assert.equal(
    bare?.systemPrompt,
    `Intro.\n\n## Tools\n\n${TOOLS}\n\n## Skills\n\n\n\n## Rules\n\n${GUIDELINES}\n\n${DOCS}` +
      "\nCurrent working directory: /w",
  );
});

test("{{SKILLS}} lifts the block when no project context precedes it", async () => {
  const block =
    "The following skills provide specialized instructions for specific tasks.\n" +
    "Use the read tool to load a skill's file when the task matches its description.\n\n" +
    "<available_skills>\n  <skill>\n    <name>harvest</name>\n  </skill>\n</available_skills>";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-skills-"));
  fs.writeFileSync(
    path.join(dir, "default.md"),
    "Intro.\n\n{{AVAILABLE_TOOLS}}\n\n{{SKILLS}}\n\n{{GUIDELINES}}\n\n{{PI_DOCS}}\n",
  );
  let handler: any;
  systemPromptExtension(
    {
      on(name: string, fn: unknown) {
        if (name === "before_agent_start") handler = fn;
      },
      registerCommand() {},
    } as never,
    { templatesDir: dir },
  );
  const result = await handler({
    systemPrompt:
      STOCK_CORE + "\n\n" + block + "\nCurrent working directory: /w",
  });
  assert.equal(
    result?.systemPrompt,
    `Intro.\n\n${TOOLS}\n\n${block}\n\n${GUIDELINES}\n\n${DOCS}\nCurrent working directory: /w`,
  );
});
