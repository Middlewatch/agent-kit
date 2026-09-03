/**
 * Pure template-library logic for the prompt-picker extension: directory
 * scanning, frontmatter parsing, and body extraction. No pi imports, so
 * tests run under plain `node --test`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PromptTemplate {
	/** Filename without `.md`; also the template's native /name command. */
	name: string;
	/** Frontmatter `description`, or the first non-empty body line. */
	description: string;
	/** Frontmatter `argument-hint`, when present. */
	argumentHint?: string;
	/** Template text with the frontmatter block stripped. */
	body: string;
}

/** Parse one template file's raw text into its parts. */
export function parseTemplate(name: string, raw: string): PromptTemplate {
	const lines = raw.replace(/^﻿/, "").split("\n");
	let description = "";
	let argumentHint: string | undefined;
	let bodyStart = 0;

	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
		if (end > 0) {
			for (const line of lines.slice(1, end)) {
				const match = line.match(/^([A-Za-z-]+):\s*(.*)$/);
				if (!match) continue;
				const value = match[2].trim().replace(/^["']|["']$/g, "");
				if (match[1] === "description") description = value;
				if (match[1] === "argument-hint") argumentHint = value;
			}
			bodyStart = end + 1;
		}
	}

	const body = lines.slice(bodyStart).join("\n").replace(/^\s*\n/, "").trimEnd();

	if (!description) {
		const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
		description = firstLine.trim().slice(0, 80);
	}

	return { name, description, argumentHint, body };
}

/** Load every `.md` template in a directory, sorted by name. README is not a template. */
export function loadPromptDir(dir: string): PromptTemplate[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const prompts: PromptTemplate[] = [];
	for (const f of entries.filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort()) {
		try {
			prompts.push(parseTemplate(f.slice(0, -3), readFileSync(join(dir, f), "utf8")));
		} catch {
			// A file deleted or unreadable mid-scan drops out of this listing only.
		}
	}
	return prompts;
}
