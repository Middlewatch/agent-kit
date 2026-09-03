/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadPromptDir, parseTemplate } from "./lib.ts";

test("parseTemplate reads frontmatter and strips it from the body", () => {
	const raw = '---\ndescription: "Review staged changes"\nargument-hint: <focus>\n---\n\nReview `git diff --cached`.\nFocus on $1.';
	const t = parseTemplate("review-staged", raw);
	assert.equal(t.name, "review-staged");
	assert.equal(t.description, "Review staged changes");
	assert.equal(t.argumentHint, "<focus>");
	assert.equal(t.body, "Review `git diff --cached`.\nFocus on $1.");
});

test("parseTemplate without frontmatter uses the first non-empty line as description", () => {
	const t = parseTemplate("plain", "\nSummarize the session.\nMore detail.\n");
	assert.equal(t.description, "Summarize the session.");
	assert.equal(t.argumentHint, undefined);
	assert.equal(t.body, "Summarize the session.\nMore detail.");
});

test("parseTemplate strips a UTF-8 BOM before frontmatter detection", () => {
	const t = parseTemplate("bom", "﻿---\ndescription: With BOM\n---\nBody.");
	assert.equal(t.description, "With BOM");
	assert.equal(t.body, "Body.");
});

test("parseTemplate leaves a lone --- opener in the body when unclosed", () => {
	const t = parseTemplate("odd", "---\nnot frontmatter");
	assert.equal(t.body, "---\nnot frontmatter");
});

test("loadPromptDir lists .md templates sorted, skipping README, and survives a missing dir", () => {
	const dir = mkdtempSync(join(tmpdir(), "prompt-picker-test-"));
	try {
		writeFileSync(join(dir, "b.md"), "Second");
		writeFileSync(join(dir, "a.md"), "First");
		writeFileSync(join(dir, "README.md"), "Not a template");
		writeFileSync(join(dir, "notes.txt"), "Not markdown");
		const prompts = loadPromptDir(dir);
		assert.deepEqual(prompts.map((p) => p.name), ["a", "b"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	assert.deepEqual(loadPromptDir(join(tmpdir(), "prompt-picker-does-not-exist")), []);
});
