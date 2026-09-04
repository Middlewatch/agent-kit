import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture } from "./fixture.ts";

function providerText(h: Awaited<ReturnType<typeof fixture>>, suffix = ".txt") {
  const dir = join(h.artifactsDir, "inspect");
  return readFileSync(
    join(
      dir,
      readdirSync(dir).find((name) => name.endsWith(`-provider${suffix}`))!,
    ),
    "utf8",
  );
}

test("review: modified static core prose fails open rather than dropping prior policy", async () => {
  const h = await fixture({ insertCore: true });
  expect(await h.prompt()).toBe(h.incoming.at(-1));
  expect(h.finalPayloads.at(-1)).toMatchObject({
    system: expect.stringContaining("CRITICAL PRIOR POLICY"),
  });
});

test("review: capture and result hash follow the final payload after later transformers", async () => {
  const h = await fixture({ transformPayload: true });
  await h.session.prompt("/sysprompt inspect");
  expect(await h.prompt()).toBe("ACTUAL FINAL");
  expect(providerText(h)).toBe("ACTUAL FINAL");
});

test.each(["global", "workspace", "inline"] as const)(
  "review: inspection names the %s custom-core source",
  async (kind) => {
    const h = await fixture(
      kind === "inline"
        ? { customPrompt: "INLINE CORE" }
        : { customFile: kind },
    );
    await h.session.prompt("/sysprompt inspect");
    await h.prompt();
    const expected =
      kind === "inline"
        ? "core-source: inline"
        : `core-source: file ${join(kind === "global" ? h.agentDir : join(h.cwd, ".pi"), "SYSTEM.md")}`;
    expect(providerText(h, ".md")).toContain(expected);
    const dir = join(h.artifactsDir, "inspect");
    const immediate = readdirSync(dir).find((name) =>
      name.endsWith("-immediate.md"),
    )!;
    expect(readFileSync(join(dir, immediate), "utf8")).toContain(expected);
  },
);

test("review: output result uses request-time model after a switch during startup", async () => {
  let h: Awaited<ReturnType<typeof fixture>>;
  h = await fixture({
    beforeStart: async () => {
      await h.session.setModel(h.models[1]!);
    },
  });
  const finished = new Promise<void>((resolve) =>
    h.session.subscribe((event) => {
      if (event.type === "agent_end") resolve();
    }),
  );
  await h.session.prompt("/sysprompt test");
  await finished;
  await h.session.waitForIdle();
  const dir = join(h.artifactsDir, "output-tests");
  const file = readdirSync(dir)[0]!;
  expect(file).toContain(h.models[1]!.id);
  expect(readFileSync(join(dir, file), "utf8")).toContain(
    `- model: ${h.models[1]!.id}`,
  );
});
