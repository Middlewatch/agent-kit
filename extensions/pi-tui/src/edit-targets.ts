/**
 * Discovery for /edit: estate files grouped into roots for the two-level
 * picker. Built-in roots (skills, prompt templates, system prompt slots)
 * are joined by settings packages that ship a guidance/sysprompt/ dir (the
 * kit's system prompt templates) and by owner-mapped folders from the untracked
 * ~/.pi/agent/pi-tui-edit.json, so no machine path lives in this repo.
 */
import { type Dirent, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import { resolvePackageRef } from "./estate.ts";

export interface EditTarget {
	label: string;
	description?: string;
	path: string;
	exists: boolean;
}

export interface EditRootSpec {
	label: string;
	targets: EditTarget[];
}

export interface EditRoots {
	agentsDir: string;
	piAgentDir: string;
	cwd: string;
}

const CONFIG_NAME = "pi-tui-edit.json";

function readJson(path: string): any {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return undefined;
	}
}

function byLabel(a: EditTarget, b: EditTarget): number {
	return a.label.localeCompare(b.label);
}

/** Dirent type checks that follow symlinks (the estate links freely). */
function entryIsDir(parent: string, entry: Dirent): boolean {
	if (!entry.isSymbolicLink()) return entry.isDirectory();
	try {
		return statSync(join(parent, entry.name)).isDirectory();
	} catch {
		return false;
	}
}

function entryIsFile(parent: string, entry: Dirent): boolean {
	if (!entry.isSymbolicLink()) return entry.isFile();
	try {
		return statSync(join(parent, entry.name)).isFile();
	} catch {
		return false;
	}
}

function skillTargets(agentsDir: string): EditTarget[] {
	const skillsDir = join(agentsDir, "skills");
	try {
		return readdirSync(skillsDir, { withFileTypes: true })
			.filter((entry) => entryIsDir(skillsDir, entry) && existsSync(join(skillsDir, entry.name, "SKILL.md")))
			.map((entry) => ({ label: entry.name, path: join(skillsDir, entry.name, "SKILL.md"), exists: true }))
			.sort(byLabel);
	} catch {
		return [];
	}
}

/** Flat *.md listing, labels without the extension (prompt/template names). */
function markdownNames(directory: string): EditTarget[] {
	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entryIsFile(directory, entry) && entry.name.endsWith(".md"))
			.map((entry) => ({ label: entry.name.slice(0, -3), path: join(directory, entry.name), exists: true }))
			.sort(byLabel);
	} catch {
		return [];
	}
}

function fileTarget(label: string, path: string): EditTarget {
	const exists = existsSync(path);
	return { label, path, exists, description: exists ? undefined : "new file" };
}

function systemTargets(piAgentDir: string, cwd: string): EditTarget[] {
	return [
		fileTarget("global", join(piAgentDir, "SYSTEM.md")),
		fileTarget("global append", join(piAgentDir, "APPEND_SYSTEM.md")),
		fileTarget("project", join(cwd, ".pi", "SYSTEM.md")),
		fileTarget("project append", join(cwd, ".pi", "APPEND_SYSTEM.md")),
	];
}

/** User-settings packages that ship guidance/sysprompt/*.md become roots. */
function packageTemplateRoots(piAgentDir: string, cwd: string): EditRootSpec[] {
	const settings = readJson(join(piAgentDir, "settings.json"));
	const entries = Array.isArray(settings?.packages) ? settings.packages : [];
	const roots: EditRootSpec[] = [];
	for (const entry of entries) {
		const ref = resolvePackageRef(entry, piAgentDir, cwd);
		if (!ref || ref.disabled) continue;
		const targets = markdownNames(join(ref.root, "guidance", "sysprompt"));
		if (targets.length > 0) roots.push({ label: `sysprompt: ${basename(ref.root)}`, targets });
	}
	return roots;
}

export interface ScanOptions {
	maxDepth?: number;
	cap?: number;
}

/**
 * Recursive *.md scan with relative-path labels. Dotdirs and
 * node_modules are skipped; depth and file count are capped so a
 * mapped folder can never flood the picker.
 */
export function scanMarkdown(dir: string, options: ScanOptions = {}): EditTarget[] {
	const { maxDepth = 6, cap = 400 } = options;
	const found: EditTarget[] = [];
	const walk = (current: string, prefix: string, depth: number): void => {
		if (depth > maxDepth || found.length >= cap) return;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return;
		}
		for (const entry of entries) {
			if (found.length >= cap) return;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			if (entryIsDir(current, entry)) walk(join(current, entry.name), `${prefix}${entry.name}/`, depth + 1);
			else if (entryIsFile(current, entry) && entry.name.endsWith(".md")) {
				found.push({ label: `${prefix}${entry.name}`, path: join(current, entry.name), exists: true });
			}
		}
	};
	walk(dir, "", 0);
	return found.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

const expandHome = (path: string): string => (path.startsWith("~") ? join(homedir(), path.slice(1)) : path);

/** Owner-mapped folders from the untracked config; missing dirs are dropped. */
function configRoots(configPath: string, cwd: string): EditRootSpec[] {
	const config = readJson(configPath);
	const entries = Array.isArray(config?.roots) ? config.roots : [];
	const roots: EditRootSpec[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry.label !== "string" || typeof entry.path !== "string") continue;
		const dir = resolve(cwd, expandHome(entry.path));
		const targets = scanMarkdown(dir);
		if (targets.length > 0) roots.push({ label: entry.label, targets });
	}
	return roots;
}

/** All roots for the picker; empty ones vanish except system and config. */
export function discoverEditRoots(roots: EditRoots): EditRootSpec[] {
	const { agentsDir, piAgentDir, cwd } = roots;
	const configPath = join(piAgentDir, CONFIG_NAME);
	const specs: EditRootSpec[] = [
		{ label: "skills", targets: skillTargets(agentsDir) },
		{ label: "prompts: global", targets: markdownNames(join(piAgentDir, "prompts")) },
		{ label: "prompts: project", targets: markdownNames(join(cwd, ".pi", "prompts")) },
		{ label: "system", targets: systemTargets(piAgentDir, cwd) },
		...packageTemplateRoots(piAgentDir, cwd),
		...configRoots(configPath, cwd),
		{ label: "config", targets: [fileTarget(CONFIG_NAME, configPath)] },
	];
	return specs.filter((spec) => spec.targets.length > 0);
}

/** Token fuzzy match over labels; empty query passes everything through. */
export function filterTargets(targets: EditTarget[], query: string): EditTarget[] {
	if (query.trim() === "") return targets;
	return fuzzyFilter(targets, query, (target) => target.label);
}
