import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { sha256 } from "../lib/evidence.ts";
import { fixture } from "./fixture.ts";

const templateDir = process.env.SYSPROMPT_TEMPLATE_DIR!;
const guide = readFileSync(process.env.SYSPROMPT_GUIDE!, "utf8");
const names = readdirSync(templateDir).filter((name) =>
  /^[a-z0-9-]+\.md$/.test(name),
);

test.each(names)(
  "shipped %s preserves owner policy once and captures its scoped provenance",
  async (name) => {
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
    expect(text).toBe(system);
    expect(system.split("## Communication Guidelines")).toHaveLength(2);
    expect(system.split("### Prose examples")).toHaveLength(2);
    expect(system).toContain(guide);
    expect(system).not.toContain(
      "Project-specific instructions and guidelines:",
    );
    expect(markdown).toContain("selected-template: default.md");
    expect(markdown).toContain("rendered-template: default.md");
    expect(markdown).toContain(`template-sha256: ${sha256(template)}`);
    expect(markdown).toContain(`provider-system-sha256: ${sha256(text)}`);
    expect(markdown).toContain(
      `instruction: global ${join(h.agentDir, "AGENTS.md")} sha256:${sha256(guide)}`,
    );
    expect(markdown).toContain(
      `instruction: workspace ${join(h.cwd, "AGENTS.md")} directory=${h.cwd}`,
    );
    expect(markdown).toContain("fallback-or-bypass: (none)");
    for (const slot of [
      "AVAILABLE_TOOLS",
      "GUIDELINES",
      "SKILLS",
      "PI_DOCS",
      "PI_SCRATCHPAD",
      "GLOBAL_INSTRUCTIONS",
      "WORKSPACE_INSTRUCTIONS",
    ])
      expect(system).not.toContain(`{{${slot}}}`);
  },
);

test.each(["scope", "core"])(
  "%s drift preserves the exact incoming prompt and records its reason",
  async (kind) => {
    const h = await fixture({
      template: "SHOULD NOT RENDER",
      eraseScope: kind === "scope",
      driftCore: kind === "core",
    });
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      await h.session.prompt("/sysprompt inspect");
      expect(await h.prompt()).toBe(h.incoming.at(-1));
      expect(
        stderr.mock.calls.some(([text]) =>
          String(text).includes("incoming prompt preserved"),
        ),
      ).toBe(true);
      const dir = join(h.artifactsDir, "inspect");
      const provider = readdirSync(dir).find((file) =>
        file.endsWith("-provider.md"),
      )!;
      const markdown = readFileSync(join(dir, provider), "utf8");
      expect(markdown).toContain("rendered-template: (incoming prompt)");
      expect(markdown).toContain(
        kind === "scope"
          ? "instruction scope or boundary not recognized"
          : "stock core boundary not recognized",
      );
    } finally {
      stderr.mockRestore();
    }
  },
);

test("custom-core bypass is quiet and inspection identifies the bypass", async () => {
  const h = await fixture({ customPrompt: "CUSTOM CORE" });
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    await h.session.prompt("/sysprompt inspect");
    expect(await h.prompt()).toBe(h.incoming.at(-1));
    expect(stderr.mock.calls).toHaveLength(0);
    const dir = join(h.artifactsDir, "inspect");
    const provider = readdirSync(dir).find((file) =>
      file.endsWith("-provider.md"),
    )!;
    expect(readFileSync(join(dir, provider), "utf8")).toContain(
      "fallback-or-bypass: custom system prompt bypass",
    );
  } finally {
    stderr.mockRestore();
  }
});

test("inspection arms do not leak between real sessions sharing the template store", async () => {
  const a = await fixture();
  const b = await fixture({ reuse: a });
  await a.session.prompt("/sysprompt inspect");
  await b.prompt();
  const dir = join(a.artifactsDir, "inspect");
  expect(readdirSync(dir).some((name) => name.endsWith("-provider.txt"))).toBe(
    false,
  );
  const system = await a.prompt();
  const capture = readdirSync(dir).find((name) =>
    name.endsWith("-provider.txt"),
  )!;
  expect(readFileSync(join(dir, capture), "utf8")).toBe(system);
});

test("output test captures provider text and records rendered bytes rather than later edits", async () => {
  const h = await fixture({ template: "TEST CORE" });
  await h.session.prompt("/sysprompt test");
  await h.session.waitForIdle();
  const dir = join(h.artifactsDir, "output-tests");
  const result = readdirSync(dir)[0]!;
  const body = readFileSync(join(dir, result), "utf8");
  writeFileSync(join(h.templatesDir, "default.md"), "LATER EDIT");
  expect(body).toContain(`template-sha256: ${sha256("TEST CORE")}`);
  expect(body).toContain(`- model: ${h.models[0]!.id}`);
  const captures = join(h.artifactsDir, "inspect");
  const capture = readdirSync(captures).find((name) =>
    name.endsWith("-provider.txt"),
  )!;
  const text = readFileSync(join(captures, capture), "utf8");
  expect(text).toMatch(/^TEST CORE/);
  expect(body).toContain(`provider-system-sha256: ${sha256(text)}`);
  expect(body).toContain("recorded");
});
