import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
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

test("review: prose an earlier extension inserted into the core fails open rather than being dropped", async () => {
  const h = await fixture({ insertCore: true });
  const system = await h.prompt();
  assert.equal(system, h.incoming.at(-1));
  assert.ok(system.includes("CRITICAL PRIOR POLICY"));
  assert.ok(!system.includes("TEMPLATE CORE"));
});

// Stock Pi exposes a custom core only as text, so a SYSTEM.md file and an
// inline prompt inspect the same way.
for (const kind of ["global", "workspace", "inline"] as const) {
  test(`review: inspection names the ${kind} custom core as custom`, async () => {
    const h = await fixture(
      kind === "inline"
        ? { customPrompt: "INLINE CORE" }
        : { customFile: kind },
    );
    await h.session.prompt("/sysprompt inspect");
    const system = await h.prompt();
    assert.match(system, kind === "inline" ? /^INLINE CORE/ : /^FILE CORE/);
    const expected = "core-source: custom";
    assert.ok(providerText(h, ".md").includes(expected));
    const dir = join(h.artifactsDir, "inspect");
    const immediate = readdirSync(dir).find((name) =>
      name.endsWith("-immediate.md"),
    )!;
    assert.ok(readFileSync(join(dir, immediate), "utf8").includes(expected));
  });
}

test("review: output result uses the request-time model after a switch during startup", async () => {
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
  assert.ok(file.includes(h.models[1]!.id), file);
  assert.ok(
    readFileSync(join(dir, file), "utf8").includes(
      `- model: ${h.models[1]!.id}`,
    ),
  );
});
