/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCAL_TOOLS_LEAD, liftSection, parseDropList, withLocalTools, withRules } from "./lib.ts";

const PROMPT = [
	"You are an expert coding assistant.",
	"<tools>\n- read: Read file contents\n\nIn addition to the tools above, more may exist.\n</tools>",
	"<rules>\n- Use read to examine files\n- Be concise in your responses\n</rules>",
	'<project_context>\n<project_instructions path="/a">\nMentions <rules>\n- fake\n</rules> in prose.\n</project_instructions>\n</project_context>',
].join("\n\n");

test("liftSection returns pi's own body, not a later mention in user text", () => {
	assert.equal(liftSection(PROMPT, "rules"), "- Use read to examine files\n- Be concise in your responses");
	assert.equal(
		liftSection(PROMPT, "tools"),
		"- read: Read file contents\n\nIn addition to the tools above, more may exist.",
	);
});

test("liftSection is undefined when the wrapper is absent or unclosed", () => {
	assert.equal(liftSection(PROMPT, "docs"), undefined);
	assert.equal(liftSection("preamble\n\n<rules>\n- never closed", "rules"), undefined);
});

test("withLocalTools appends the roster under its lead line, or leaves the body alone", () => {
	assert.equal(withLocalTools("- read: x", "- `sess`: y\n"), `- read: x\n\n${LOCAL_TOOLS_LEAD}\n- \`sess\`: y`);
	assert.equal(withLocalTools("- read: x", ""), "- read: x");
});

test("parseDropList skips blanks and comments and accepts an optional bullet", () => {
	assert.deepEqual(parseDropList("# stock rules to remove\n\n- Be concise in your responses\nShow file paths\n"), [
		"Be concise in your responses",
		"Show file paths",
	]);
});

test("withRules drops exact bullets only and appends the owner's rules", () => {
	const body = "- Use read to examine files\n- Be concise in your responses\n- Be concise in your responses, mostly";
	assert.equal(
		withRules(body, ["Be concise in your responses", "Not present"], "\n- State what success means.\n"),
		"- Use read to examine files\n- Be concise in your responses, mostly\n- State what success means.",
	);
	assert.equal(withRules(body, [], ""), body);
});
