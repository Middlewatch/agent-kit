/**
 * Unit tests for the template splice. A stub ExtensionAPI captures the
 * before_agent_start handler; a stock prompt built the way Pi builds it
 * exercises the rewrite and each fail-open branch through the index.ts
 * composition, and a few tests drive lib/splice.ts renderTemplate directly.
 * No Pi process and no provider request.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AGENT_DIR,
  CONTEXT,
  DOC_PATHS,
  DOCS,
  FILES,
  GLOBAL_BLOCK,
  GUIDELINES,
  STOCK_CORE,
  STOCK_OPTIONS,
  TOOLS,
  sessionStub,
} from "./stubs.ts";
import systemPromptExtension from "../index.ts";
import { renderTemplate, scratchpadSection } from "../lib/splice.ts";

const TAIL = CONTEXT + "\nCurrent working directory: /tmp";
const SCOPED_TAIL =
  "\n\n<instruction_context>\n\nGlobal instructions apply across workspaces. Workspace instructions apply within their named directory; deeper workspace instructions take precedence for files in their scope.\n\n" +
  GLOBAL_BLOCK +
  "\n\n</instruction_context>";

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

type Handler = (event: {
  systemPrompt: string;
  systemPromptOptions?: Record<string, unknown>;
}) => Promise<{ systemPrompt: string } | undefined>;

/** Build the extension on a templates dir; events get stock inputs by default. */
function capturedHandler(templatesDir = TEMPLATES_DIR): Handler {
  let handler: unknown;
  const state = sessionStub();
  const stub = {
    appendEntry: state.appendEntry,
    on(name: string, fn: unknown) {
      if (name === "before_agent_start")
        handler = (event: unknown) => (fn as any)(event, state.context());
    },
    registerCommand() {},
  };
  systemPromptExtension(stub as never, {
    templatesDir,
    agentDir: AGENT_DIR,
    docPaths: DOC_PATHS,
  });
  assert.ok(handler, "extension registered a before_agent_start handler");
  return (event) =>
    (handler as any)({
      ...event,
      systemPromptOptions: {
        ...STOCK_OPTIONS,
        contextFiles: event.systemPrompt.includes(CONTEXT) ? FILES : [],
        ...event.systemPromptOptions,
      },
    });
}

test("stock prompt is rebuilt with scoped instructions moved and other tail bytes preserved", async () => {
  const result = await capturedHandler()({ systemPrompt: STOCK_CORE + TAIL });
  assert.ok(result, "handler returned a rewritten prompt");
  for (const value of [TOOLS, GUIDELINES, DOCS])
    assert.ok(result.systemPrompt.includes(value));
  assert.equal(result.systemPrompt.split(GLOBAL_BLOCK).length, 2);
  assert.ok(!result.systemPrompt.includes("<project_context>"));
  assert.ok(
    result.systemPrompt.indexOf("stub") <
      result.systemPrompt.indexOf("<available_tools>"),
  );
  assert.ok(
    result.systemPrompt.includes(
      "<session_context>\nCurrent working directory: /tmp",
    ),
  );
  assert.ok(result.systemPrompt.endsWith("</session_context>"));
  assert.ok(!result.systemPrompt.includes("{{GLOBAL_INSTRUCTIONS}}"));
});

test("a legacy template retains opaque tail bytes when the new slots are omitted", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-legacy-"));
  fs.writeFileSync(
    path.join(dir, "default.md"),
    "LEGACY\n{{AVAILABLE_TOOLS}}\n{{GUIDELINES}}\n{{PI_DOCS}}",
  );
  const handler = capturedHandler(dir);
  const rendered = (await handler({ systemPrompt: STOCK_CORE }))!.systemPrompt;
  for (const tail of [
    "\n<available_skills>\n  <skill>x</skill>\n</available_skills>\nCurrent working directory: /tmp",
    "\nCurrent working directory: /tmp",
  ]) {
    const r = await handler({ systemPrompt: STOCK_CORE + tail });
    assert.equal(r?.systemPrompt, rendered + tail);
  }
});

test("the default layout preserves the incoming prompt when its session footer is missing", async () => {
  assert.equal(
    await capturedHandler()({ systemPrompt: STOCK_CORE }),
    undefined,
  );
});

test("a template without instruction slots keeps the files in the tail, scoped, in loader order", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-noslot-"));
  fs.writeFileSync(path.join(dir, "default.md"), "CORE\n{{AVAILABLE_TOOLS}}");
  const files = [
    { path: "/g/AGENTS.md", content: "global" },
    { path: "/w/AGENTS.md", content: "parent" },
    { path: "/w/n/AGENTS.md", content: "nested" },
  ];
  const { projectContext } = await import("../lib/stock-core.ts");
  const result = await capturedHandler(dir)({
    systemPrompt:
      STOCK_CORE + projectContext(files) + "\nCurrent working directory: /w/n",
    systemPromptOptions: { contextFiles: files },
  });
  assert.equal(
    result?.systemPrompt,
    `CORE\n${TOOLS}\n\n<instruction_context>\n\nGlobal instructions apply across workspaces. Workspace instructions apply within their named directory; deeper workspace instructions take precedence for files in their scope.\n\n` +
      '<global_instructions path="/g/AGENTS.md">\nglobal\n</global_instructions>\n\n' +
      '<workspace_instructions path="/w/AGENTS.md" directory="/w">\nparent\n</workspace_instructions>\n\n' +
      '<workspace_instructions path="/w/n/AGENTS.md" directory="/w/n">\nnested\n</workspace_instructions>\n\n' +
      "</instruction_context>\nCurrent working directory: /w/n",
  );
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

test("a core that differs from Pi's own construction fails open", async () => {
  const handler = capturedHandler();
  // Drifted prose (a Pi release changed the core).
  assert.equal(
    await handler({
      systemPrompt: STOCK_CORE.replace("Guidelines:", "House rules:") + TAIL,
    }),
    undefined,
  );
  // An earlier extension inserted policy inside the core.
  assert.equal(
    await handler({
      systemPrompt:
        STOCK_CORE.replace(
          "\n\nAvailable tools:",
          "\n\nCRITICAL PRIOR POLICY\n\nAvailable tools:",
        ) + TAIL,
    }),
    undefined,
  );
  // Inputs that disagree with the prompt (a different tool set).
  assert.equal(
    await handler({
      systemPrompt: STOCK_CORE + TAIL,
      systemPromptOptions: { selectedTools: ["read"] },
    }),
    undefined,
  );
});

test("instruction files that disagree with the tail fail open", async () => {
  const handler = capturedHandler();
  assert.equal(
    await handler({
      systemPrompt: STOCK_CORE + TAIL,
      systemPromptOptions: { contextFiles: [] },
    }),
    undefined,
  );
  assert.equal(
    await handler({
      systemPrompt: STOCK_CORE + "\nCurrent working directory: /tmp",
      systemPromptOptions: { contextFiles: FILES },
    }),
    undefined,
  );
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
  assert.equal(scratchpadSection(undefined), "");
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

const SKILLS_BLOCK =
  "The following skills provide specialized instructions for specific tasks.\n" +
  "Use the read tool to load a skill's file when the task matches its description.\n\n" +
  "<available_skills>\n  <skill>\n    <name>harvest</name>\n  </skill>\n</available_skills>";

test("{{SKILLS}} relocates pi's stock skills block into the template", async () => {
  const tail =
    CONTEXT + "\n" + SKILLS_BLOCK + "\nCurrent working directory: /w";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-skills-"));
  fs.writeFileSync(
    path.join(dir, "default.md"),
    "Intro.\n\n## Tools\n\n{{AVAILABLE_TOOLS}}\n\n## Skills\n\n{{SKILLS}}\n\n## Rules\n\n{{GUIDELINES}}\n\n{{PI_DOCS}}\n",
  );
  const handler = capturedHandler(dir);
  const result = await handler({ systemPrompt: STOCK_CORE + tail });
  assert.equal(
    result?.systemPrompt,
    `Intro.\n\n## Tools\n\n${TOOLS}\n\n## Skills\n\n${SKILLS_BLOCK}\n\n## Rules\n\n${GUIDELINES}\n\n${DOCS}` +
      SCOPED_TAIL +
      "\nCurrent working directory: /w",
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysprompt-skills-"));
  fs.writeFileSync(
    path.join(dir, "default.md"),
    "Intro.\n\n{{AVAILABLE_TOOLS}}\n\n{{SKILLS}}\n\n{{GUIDELINES}}\n\n{{PI_DOCS}}\n",
  );
  const result = await capturedHandler(dir)({
    systemPrompt:
      STOCK_CORE + "\n\n" + SKILLS_BLOCK + "\nCurrent working directory: /w",
  });
  assert.equal(
    result?.systemPrompt,
    `Intro.\n\n${TOOLS}\n\n${SKILLS_BLOCK}\n\n${GUIDELINES}\n\n${DOCS}\nCurrent working directory: /w`,
  );
});
