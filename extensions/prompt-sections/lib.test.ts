/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	describePatches,
	foldSections,
	LOCAL_TOOLS_LEAD,
	liftSection,
	parseDropList,
	previewPrompt,
	type SystemRecord,
	withLocalTools,
	withRules,
} from "./lib.ts";

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

test("withRules drops exact bullets only", () => {
	const body = "- Use read to examine files\n- Be concise in your responses\n- Be concise in your responses, mostly";
	assert.equal(
		withRules(body, ["Be concise in your responses", "Not present"]),
		"- Use read to examine files\n- Be concise in your responses, mostly",
	);
	assert.equal(withRules(body, []), body);
});

test("previewPrompt writes both overrides back in place and leaves later text alone", () => {
	const out = previewPrompt(PROMPT, { roster: "- `sess`: y", drop: ["Be concise in your responses"] });
	assert.equal(
		out,
		PROMPT.replace("more may exist.\n</tools>", `more may exist.\n\n${LOCAL_TOOLS_LEAD}\n- \`sess\`: y\n</tools>`).replace(
			"- Use read to examine files\n- Be concise in your responses\n</rules>\n\n<project_context>",
			"- Use read to examine files\n</rules>\n\n<project_context>",
		),
	);
	assert.equal(previewPrompt("no sections here", { roster: "", drop: [] }), undefined);
});

test("foldSections applies patches in order and keeps a section's first position", () => {
	const records: SystemRecord[] = [
		{ timestamp: 1, sections: { preamble: "p", rules: "<rules>a</rules>", cwd: "<cwd>/x</cwd>", scratchpad: "s" } },
		{ timestamp: 2, sections: { rules: "<rules>b</rules>", scratchpad: null }, toolsRemoved: ["write"] },
	];
	assert.deepEqual(Object.entries(foldSections(records)), [
		["preamble", "p"],
		["rules", "<rules>b</rules>"],
		["cwd", "<cwd>/x</cwd>"],
	]);
	const text = describePatches(records);
	assert.match(text, /updated <rules> {2}16 chars/);
	assert.match(text, /removed <scratchpad>/);
	assert.match(text, /tools removed: write/);
	assert.equal(describePatches(records.slice(0, 1)), "No changes since the first system message.");
});
