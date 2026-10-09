/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bashSection } from "./lib.ts";

const guide = readFileSync(new URL("./guide.md", import.meta.url), "utf8");

test("the section is the trimmed guide while bash is active", () => {
	assert.equal(bashSection(" rules\n", ["read", "bash"]), "rules");
});

test("no section without the bash tool, or with an empty guide", () => {
	assert.equal(bashSection("rules", ["read"]), undefined);
	assert.equal(bashSection("rules", undefined), undefined);
	assert.equal(bashSection(" \n", ["bash"]), undefined);
});

test("the shipped guide has both rule groups and stays small", () => {
	const section = bashSection(guide, ["bash"]) ?? "";
	assert.match(section, /^Bash rules:/);
	assert.match(section, /\nBatching rules:\n/);
	assert.ok(section.length < 3000, `guide is ${section.length} chars; it rides every request`);
});
