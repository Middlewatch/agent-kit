/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import { expandSkillLines, renderSkillBlock, type SkillRef, skillRoots } from "./lib.ts";

const skills: Record<string, SkillRef> = {
	slopfix: { name: "slopfix", filePath: "/k/skills/slopfix/SKILL.md", baseDir: "/k/skills/slopfix" },
	why: { name: "why", filePath: "/k/skills/why/SKILL.md", baseDir: "/k/skills/why" },
};
const resolve = (name: string) => skills[name];
const readBody = (s: SkillRef) => `BODY(${s.name})`;

test("a skill line in the middle of a prompt expands in place, text before and after kept", () => {
	const r = expandSkillLines("Context first.\n/skill:slopfix\nThen do this after.", resolve, readBody);
	assert.deepEqual(r.expanded, ["slopfix"]);
	assert.equal(r.text, `Context first.\n${renderSkillBlock(skills.slopfix, "BODY(slopfix)")}\nThen do this after.`);
});

test("two skills in one prompt both expand, in order", () => {
	const r = expandSkillLines("/skill:why\nbridge\n/skill:slopfix", resolve, readBody);
	assert.deepEqual(r.expanded, ["why", "slopfix"]);
	assert.match(r.text, /<skill name="why"[\s\S]*bridge[\s\S]*<skill name="slopfix"/);
});

test("same-line args are appended after the block, matching pi's first-line format", () => {
	const r = expandSkillLines("/skill:slopfix docs/README.md  ", resolve, readBody);
	assert.equal(r.text, `${renderSkillBlock(skills.slopfix, "BODY(slopfix)")}\n\ndocs/README.md`);
});

test("an unknown skill is left in place and reported", () => {
	const r = expandSkillLines("a\n/skill:nope\nb", resolve, readBody);
	assert.equal(r.text, "a\n/skill:nope\nb");
	assert.deepEqual(r.expanded, []);
	assert.deepEqual(r.unknown, ["nope"]);
});

test("skill lines inside a code fence are not expanded", () => {
	const src = "```\n/skill:slopfix\n```\ntext";
	const r = expandSkillLines(src, resolve, readBody);
	assert.equal(r.text, src);
	assert.deepEqual(r.expanded, []);
});

test("a skill token that is not at line start is plain text", () => {
	const src = "see /skill:slopfix for the rules";
	const r = expandSkillLines(src, resolve, readBody);
	assert.equal(r.text, src);
	assert.deepEqual(r.expanded, []);
	assert.deepEqual(r.unknown, []);
});

test("skillRoots lists ~/agent-kit/skills and .agents/skills up to the git root, existing ones only", () => {
	const present = new Set(["/h/agent-kit/skills", "/h/p/repo/.agents/skills", "/h/p/repo/.git"]);
	const exists = (p: string) => present.has(p);
	assert.deepEqual(skillRoots("/h/p/repo/src/deep", "/h", exists), ["/h/agent-kit/skills", "/h/p/repo/.agents/skills"]);
	// Without a git root the walk stops at /, and nothing beyond the home root exists here.
	assert.deepEqual(skillRoots("/tmp/x", "/h", exists), ["/h/agent-kit/skills"]);
});

test("unchanged input returns the same string instance", () => {
	const src = "no skills here";
	assert.equal(expandSkillLines(src, resolve, readBody).text, src);
});
