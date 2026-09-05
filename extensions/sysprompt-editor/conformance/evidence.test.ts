import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { sha256 } from "../lib/evidence.ts";
import { capturingStderr, fixture, kitRoot } from "./fixture.ts";

const templateDir = fileURLToPath(new URL("guidance/sysprompt/", kitRoot));
const guide = readFileSync(new URL("guidance/AGENTS.md", kitRoot), "utf8");
const names = readdirSync(templateDir).filter((name) =>
  /^[a-z0-9-]+\.md$/.test(name),
);

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

for (const name of names) {
  test(`shipped ${name} preserves owner policy once and captures its scoped provenance`, async () => {
    const template = readFileSync(join(templateDir, name), "utf8");
    const h = await fixture({ template, globalContent: guide });
    await h.session.prompt("/sysprompt inspect");
    const system = await h.prompt();
    const dir = join(h.artifactsDir, "inspect");
    const provider = readdirSync(dir).find((file) =>
      file.endsWith("-provider.md"),
    )!;
    const markdown = readFileSync(join(dir, provider), "utf8");
    const text = readFileSync(
      join(dir, provider.replace(/\.md$/, ".txt")),
      "utf8",
    );
    assert.equal(text, system);
    assert.equal(count(system, "## Communication Guidelines"), 1);
    assert.equal(count(system, "### Prose examples"), 1);
    assert.ok(system.includes(guide));
    assert.ok(
      !system.includes("Project-specific instructions and guidelines:"),
    );
    for (const line of [
      "selected-template: default.md",
      "rendered-template: default.md",
      `template-sha256: ${sha256(template)}`,
      `provider-system-sha256: ${sha256(text)}`,
      `instruction: global ${join(h.agentDir, "AGENTS.md")} sha256:${sha256(guide)}`,
      `instruction: workspace ${join(h.cwd, "AGENTS.md")} directory=${h.cwd}`,
      "fallback-or-bypass: (none)",
    ])
      assert.ok(markdown.includes(line), line);
    for (const slot of [
      "AVAILABLE_TOOLS",
      "GUIDELINES",
      "SKILLS",
      "PI_DOCS",
      "PI_SCRATCHPAD",
      "GLOBAL_INSTRUCTIONS",
      "WORKSPACE_INSTRUCTIONS",
    ])
      assert.ok(!system.includes(`{{${slot}}}`), slot);
  });
}

test("core drift preserves the exact incoming prompt and records its reason", async () => {
  const h = await fixture({ template: "SHOULD NOT RENDER", driftCore: true });
  const { result: system, lines } = await capturingStderr(async () => {
    await h.session.prompt("/sysprompt inspect");
    return h.prompt();
  });
  assert.equal(system, h.incoming.at(-1));
  assert.ok(lines.some((text) => text.includes("incoming prompt preserved")));
  const dir = join(h.artifactsDir, "inspect");
  const provider = readdirSync(dir).find((file) =>
    file.endsWith("-provider.md"),
  )!;
  const markdown = readFileSync(join(dir, provider), "utf8");
  assert.ok(markdown.includes("rendered-template: (incoming prompt)"));
  assert.ok(markdown.includes("stock core differs from Pi"));
});

test("custom-core bypass is quiet and inspection identifies the bypass", async () => {
  const h = await fixture({ customPrompt: "CUSTOM CORE" });
  const { result: system, lines } = await capturingStderr(async () => {
    await h.session.prompt("/sysprompt inspect");
    return h.prompt();
  });
  assert.equal(system, h.incoming.at(-1));
  assert.deepEqual(lines, []);
  const dir = join(h.artifactsDir, "inspect");
  const provider = readdirSync(dir).find((file) =>
    file.endsWith("-provider.md"),
  )!;
  assert.ok(
    readFileSync(join(dir, provider), "utf8").includes(
      "fallback-or-bypass: custom system prompt bypass",
    ),
  );
});

test("inspection arms do not leak between real sessions sharing the template store", async () => {
  const a = await fixture();
  const b = await fixture({ reuse: a });
  await a.session.prompt("/sysprompt inspect");
  await b.prompt();
  const dir = join(a.artifactsDir, "inspect");
  assert.equal(
    readdirSync(dir).some((name) => name.endsWith("-provider.txt")),
    false,
  );
  const system = await a.prompt();
  const capture = readdirSync(dir).find((name) =>
    name.endsWith("-provider.txt"),
  )!;
  assert.equal(readFileSync(join(dir, capture), "utf8"), system);
});

test("output test captures provider text and records rendered bytes rather than later edits", async () => {
  const h = await fixture({ template: "TEST CORE" });
  const finished = new Promise<void>((resolve) =>
    h.session.subscribe((event) => {
      if (event.type === "agent_end") resolve();
    }),
  );
  await h.session.prompt("/sysprompt test");
  await finished;
  await h.session.waitForIdle();
  const dir = join(h.artifactsDir, "output-tests");
  const result = readdirSync(dir)[0]!;
  const body = readFileSync(join(dir, result), "utf8");
  writeFileSync(join(h.templatesDir, "default.md"), "LATER EDIT");
  assert.ok(body.includes(`template-sha256: ${sha256("TEST CORE")}`));
  assert.ok(body.includes(`- model: ${h.models[0]!.id}`));
  const captures = join(h.artifactsDir, "inspect");
  const capture = readdirSync(captures).find((name) =>
    name.endsWith("-provider.txt"),
  )!;
  const text = readFileSync(join(captures, capture), "utf8");
  assert.match(text, /^TEST CORE/);
  assert.ok(body.includes(`provider-system-sha256: ${sha256(text)}`));
  assert.ok(body.includes("recorded"));
});
