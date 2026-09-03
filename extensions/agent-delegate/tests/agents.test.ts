import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadAgentDefinitions, parseAgentDefinition } from "../src/agents.ts";

const SEED_DIR = resolve(import.meta.dirname, "..", "agents");

function definition(frontmatter: string, body = "Act the role."): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

test("seed agents load with their documented bases", () => {
  const agents = loadAgentDefinitions(SEED_DIR);
  assert.deepEqual([...agents.keys()].sort(), ["comment-sicko", "critic", "editor", "explorer", "refuter", "researcher"]);
  assert.equal(agents.get("explorer")?.profile, "explore");
  assert.equal(agents.get("critic")?.profile, "review");
  assert.equal(agents.get("comment-sicko")?.profile, "review");
  assert.equal(agents.get("researcher")?.profile, "research");
  assert.equal(agents.get("refuter")?.profile, "research", "the refuter refutes from scoped evidence and independent sources");
  assert.equal(agents.get("refuter")?.tier, "judge", "the refuter escalates to the judge tier by default");
  for (const agent of agents.values()) {
    assert.equal(agent.writable, agent.name === "editor", "the editor is the only writable seed");
    assert.ok(agent.rolePrompt.length > 40, `${agent.name} carries a real role prompt`);
  }
});

test("frontmatter parses the full field set", () => {
  const parsed = parseAgentDefinition("sampler", definition(
    "profile: review\ntier: judge\nthinking: high\ntools: inspect_read, inspect_grep\nwritable: false\nturnCap: 12",
    "Hunt for counterexamples and report the strongest one.",
  ));
  assert.deepEqual(parsed, {
    name: "sampler",
    profile: "review",
    tier: "judge",
    thinking: "high",
    tools: ["inspect_read", "inspect_grep"],
    writable: false,
    turnCap: 12,
    rolePrompt: "Hunt for counterexamples and report the strongest one.",
  });
});

test("malformed definitions fail closed", () => {
  assert.throws(() => parseAgentDefinition("x", "no frontmatter body"), /agent x: missing frontmatter/);
  assert.throws(() => parseAgentDefinition("x", definition("tier: judge")), /agent x: profile is required/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: writer")), /agent x: unsupported profile: writer/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\ntier: opus")), /agent x: unsupported tier: opus/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\nthinking: max")), /agent x: unsupported thinking: max/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\nmodel: gpt-4")), /agent x: unknown key model/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\ntools: bash")), /agent x: unknown tool bash/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\ntools: ")), /agent x: tools must name at least one tool/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\nwritable: maybe")), /agent x: writable must be true or false/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\nturnCap: 0")), /agent x: turnCap must be an integer between 1 and 100/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review\nturnCap: 400")), /agent x: turnCap must be an integer between 1 and 100/);
  assert.throws(() => parseAgentDefinition("x", definition("profile: review", "   ")), /agent x: role prompt body is required/);
});

test("loadAgentDefinitions reads only .agent.md files and names agents by file", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-agents-"));
  writeFileSync(join(dir, "scout.agent.md"), definition("profile: explore", "Trace the code and cite lines."));
  writeFileSync(join(dir, "README.md"), "not an agent");
  const agents = loadAgentDefinitions(dir);
  assert.deepEqual([...agents.keys()], ["scout"]);
  assert.equal(agents.get("scout")?.turnCap, undefined, "unset fields stay undefined for profile defaults");
});

test("a broken definition file fails the whole load", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-delegate-agents-bad-"));
  writeFileSync(join(dir, "good.agent.md"), definition("profile: explore", "Trace the code."));
  writeFileSync(join(dir, "bad.agent.md"), definition("profile: explore\nsecrets: yes", "Nope."));
  assert.throws(() => loadAgentDefinitions(dir), /agent bad: unknown key secrets/);
});
