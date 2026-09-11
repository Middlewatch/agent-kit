/**
 * Asynchronous estate counts for the cached header snapshot. The extension
 * count mirrors pi's documented auto-discovery inputs (extensions.md
 * "Extension Locations", packages.md) because pi 0.84 exposes no
 * loaded-extension list to extensions. Every count degrades to
 * undefined when its source is missing, so the header simply omits it.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface EstateCounts {
	extensions?: number;
	inboxNotes?: number;
}

export interface EstateSources {
	/** ~/.agents bindings root (inbox). */
	agentsDir: string;
	/** ~/.pi/agent — settings, npm/git package caches, global extensions. */
	piAgentDir: string;
	/** Session cwd, the root for project-local .pi resources. */
	cwd: string;
	/** Whether pi trusts the project (gates .pi/extensions and .pi/settings.json). */
	projectTrusted: boolean;
}

/** Inbox: markdown notes awaiting triage, README excluded. */
export async function countInboxNotes(agentsDir: string): Promise<number | undefined> {
	try {
		return (await readdir(join(agentsDir, "inbox"), { withFileTypes: true })).filter(
			(entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md",
		).length;
	} catch {
		return undefined;
	}
}

const isDir = async (path: string): Promise<boolean> => {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
};

const isFile = async (path: string): Promise<boolean> => {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
};

const expandHome = (path: string): string => (path.startsWith("~") ? join(homedir(), path.slice(1)) : path);

const readJson = async (path: string): Promise<any> => {
	try {
		return JSON.parse(await readFile(path, "utf-8"));
	} catch {
		return undefined;
	}
};

/** Auto-discovery dirs load <dir>/*.ts plus <dir>/<sub>/index.ts. */
async function countAutoDiscoveryDir(dir: string): Promise<number> {
	try {
		let count = 0;
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			if (entry.isFile() && entry.name.endsWith(".ts")) count++;
			else if (entry.isDirectory() && (await isFile(join(dir, entry.name, "index.ts")))) count++;
		}
		return count;
	} catch {
		return 0;
	}
}

/** Package extension dirs (manifest or convention) load .ts and .js files. */
async function countPackageDir(dir: string): Promise<number> {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter(
			(entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js")),
		).length;
	} catch {
		return 0;
	}
}

/** One manifest entry is a file (one extension) or a dir of them. */
async function countManifestEntry(root: string, entry: string): Promise<number> {
	const path = resolve(root, entry);
	if (await isFile(path)) return 1;
	if (await isDir(path)) return countPackageDir(path);
	return 0;
}

/** Extensions one package contributes: pi.extensions manifest, else the extensions/ convention dir. */
export async function countPackageExtensions(root: string): Promise<number> {
	const manifest = await readJson(join(root, "package.json"));
	const pi = manifest?.pi;
	if (pi !== undefined) {
		const entries = pi.extensions;
		if (!Array.isArray(entries)) return 0;
		let count = 0;
		for (const entry of entries) {
			if (typeof entry === "string") count += await countManifestEntry(root, entry);
		}
		return count;
	}
	return countPackageDir(join(root, "extensions"));
}

interface PackageRef {
	identity: string;
	root: string;
	/** Settings filter `extensions: []` disables the package's extensions. */
	disabled: boolean;
}

/** git:host/path[@ref], git@host:path[@ref], or protocol URLs → host/path. */
function normalizeGitSource(source: string): string {
	let rest = source.replace(/^git:/, "").replace(/^(https?|ssh|git):\/\//, "");
	rest = rest.replace(/^git@([^:]+):/, "$1/");
	rest = rest.replace(/^[^/]+@(?=[^:/]+\/)/, "");
	const at = rest.lastIndexOf("@");
	if (at > rest.lastIndexOf("/")) rest = rest.slice(0, at);
	return rest.replace(/\.git$/, "");
}

/** npm:@scope/name@ver → @scope/name. */
function normalizeNpmSource(source: string): string {
	const spec = source.slice("npm:".length);
	const at = spec.lastIndexOf("@");
	return at > 0 ? spec.slice(0, at) : spec;
}

/**
 * Resolve one settings `packages` entry to its on-disk root.
 * scopeDir is where this settings file's npm/git caches live:
 * the pi agent dir for user settings, <cwd>/.pi for project settings.
 */
export function resolvePackageRef(entry: unknown, scopeDir: string, cwd: string): PackageRef | undefined {
	let source: string;
	let disabled = false;
	if (typeof entry === "string") {
		source = entry;
	} else if (entry && typeof entry === "object" && typeof (entry as any).source === "string") {
		source = (entry as any).source;
		const filter = (entry as any).extensions;
		disabled = Array.isArray(filter) && filter.length === 0;
	} else {
		return undefined;
	}

	if (source.startsWith("npm:")) {
		const name = normalizeNpmSource(source);
		return { identity: `npm:${name}`, root: join(scopeDir, "npm", "node_modules", name), disabled };
	}
	if (/^(git:|https?:\/\/|ssh:\/\/|git:\/\/)/.test(source) || source.startsWith("git@")) {
		const hostPath = normalizeGitSource(source);
		return { identity: `git:${hostPath}`, root: join(scopeDir, "git", hostPath), disabled };
	}
	const root = resolve(cwd, expandHome(source));
	return { identity: `path:${root}`, root, disabled };
}

/**
 * Mirror of pi's extension discovery: global and project auto-discovery
 * dirs, settings `extensions` entries, and settings `packages` (project
 * entries shadow user entries by identity). undefined when the pi agent
 * dir itself is missing.
 */
export async function countExtensions(sources: EstateSources): Promise<number | undefined> {
	const { piAgentDir, cwd, projectTrusted } = sources;
	if (!(await isDir(piAgentDir))) return undefined;
	try {
		let count = await countAutoDiscoveryDir(join(piAgentDir, "extensions"));
		if (projectTrusted) count += await countAutoDiscoveryDir(join(cwd, ".pi", "extensions"));

		const settingsFiles = [
			{ settings: await readJson(join(piAgentDir, "settings.json")), scopeDir: piAgentDir },
			...(projectTrusted ? [{ settings: await readJson(join(cwd, ".pi", "settings.json")), scopeDir: join(cwd, ".pi") }] : []),
		];

		const packages = new Map<string, PackageRef>();
		for (const { settings, scopeDir } of settingsFiles) {
			for (const entry of Array.isArray(settings?.extensions) ? settings.extensions : []) {
				if (typeof entry !== "string") continue;
				const path = resolve(cwd, expandHome(entry));
				count += (await isFile(path)) ? 1 : (await isDir(path)) ? await countPackageDir(path) : 0;
			}
			for (const entry of Array.isArray(settings?.packages) ? settings.packages : []) {
				const ref = resolvePackageRef(entry, scopeDir, cwd);
				if (ref) packages.set(ref.identity, ref); // later (project) settings win
			}
		}
		for (const ref of packages.values()) {
			if (!ref.disabled) count += await countPackageExtensions(ref.root);
		}
		return count;
	} catch {
		return undefined;
	}
}

export async function countEstate(sources: EstateSources): Promise<EstateCounts> {
	const [extensions, inboxNotes] = await Promise.all([
		countExtensions(sources),
		countInboxNotes(sources.agentsDir),
	]);
	return { extensions, inboxNotes };
}
