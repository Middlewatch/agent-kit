/**
 * Pure model behind /config: groups pi's resolved resources the way
 * `pi config` does, tracks a write scope (global or project), and turns a
 * toggle into the same settings.json edits the CLI would make, so the two
 * tools stay interoperable. No pi imports; the settings backend is a port.
 *
 * Semantics mirror pi 0.84.4 `ConfigSelectorComponent` (an internal module
 * pi does not export): `+path`/`-path` force entries, package object form,
 * and the project tri-state inherit/load/unload.
 */

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ResourceType = "extensions" | "skills" | "prompts" | "themes";
export const RESOURCE_TYPES: readonly ResourceType[] = ["extensions", "skills", "prompts", "themes"];
const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
	extensions: "Extensions",
	skills: "Skills",
	prompts: "Prompts",
	themes: "Themes",
};

export type WriteScope = "global" | "project";
export type OverrideState = "inherit" | "load" | "unload";
export type SourceScope = "user" | "project" | "temporary";

export interface PathMetadata {
	source: string;
	scope: SourceScope;
	origin: "package" | "top-level";
	baseDir?: string;
}
export interface ResolvedResource {
	path: string;
	enabled: boolean;
	metadata: PathMetadata;
}
export type ResolvedPaths = Record<ResourceType, ResolvedResource[]>;

export type PackageObject = { source: string; autoload?: boolean } & Partial<Record<ResourceType, string[]>>;
export type PackageSource = string | PackageObject;
export type ScopeSettings = { packages?: PackageSource[] } & Partial<Record<ResourceType, string[]>>;

/** The slice of pi's SettingsManager the model writes through. */
export interface SettingsPort {
	getGlobalSettings(): ScopeSettings;
	getProjectSettings(): ScopeSettings;
	setPaths(scope: WriteScope, type: ResourceType, paths: string[]): void;
	setPackages(scope: WriteScope, packages: PackageSource[]): void;
}

export interface ResourceItem {
	path: string;
	enabled: boolean;
	metadata: PathMetadata;
	resourceType: ResourceType;
	displayName: string;
}
export interface ResourceSubgroup {
	type: ResourceType;
	label: string;
	items: ResourceItem[];
}
export interface ResourceGroup {
	key: string;
	label: string;
	scope: SourceScope;
	origin: "package" | "top-level";
	source: string;
	subgroups: ResourceSubgroup[];
}
export type FlatEntry =
	| { type: "group"; group: ResourceGroup }
	| { type: "subgroup"; subgroup: ResourceSubgroup; group: ResourceGroup }
	| { type: "item"; item: ResourceItem };

export interface ItemView {
	enabled: boolean;
	override: OverrideState;
	inheritedGlobal: boolean;
	dimmed: boolean;
	togglable: boolean;
}

export interface ModelOptions {
	cwd: string;
	agentDir: string;
	/** Project config directory name under cwd; pi's is `.pi`. */
	configDirName?: string;
	homeDir?: string;
	/** Path canonicalizer for identity keys; defaults to realpath with fallback. */
	canonicalize?: (p: string) => string;
}

// ---- path helpers (ports of pi's unexported utils/paths) ----

export function isLocalPath(value: string): boolean {
	const t = value.trim();
	return !/^(npm|git|github|http|https|ssh):/.test(t);
}

export function resolvePathLike(input: string, baseDir: string, homeDir: string): string {
	let p = input.trim();
	if (p === "~") p = homeDir;
	else if (p.startsWith("~/")) p = join(homeDir, p.slice(2));
	if (/^file:\/\//.test(p)) p = fileURLToPath(p);
	return isAbsolute(p) ? resolve(p) : resolve(baseDir, p);
}

function canonicalizeDefault(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

function formatBaseDir(baseDir: string, homeDir: string): string {
	let shown: string;
	if (baseDir === homeDir) shown = "~";
	else if (baseDir.startsWith(homeDir)) shown = `~${baseDir.slice(homeDir.length).replace(/\\/g, "/")}`;
	else shown = baseDir.replace(/\\/g, "/");
	return shown.endsWith("/") ? shown : `${shown}/`;
}

function groupLabel(m: PathMetadata, agentDir: string, configDirName: string, homeDir: string): string {
	if (m.origin === "package") return `${m.source} (${m.scope})`;
	if (m.source === "auto") {
		if (m.baseDir) {
			return m.scope === "user"
				? `User (${formatBaseDir(m.baseDir, homeDir)})`
				: `Project (${formatBaseDir(m.baseDir, homeDir)})`;
		}
		return m.scope === "user" ? `User (${formatBaseDir(agentDir, homeDir)})` : `Project (${configDirName}/)`;
	}
	return m.scope === "user" ? "User settings" : "Project settings";
}

export function displayNameFor(path: string, type: ResourceType): string {
	const file = basename(path);
	const parent = basename(dirname(path));
	if (type === "extensions" && parent !== "extensions") return `${parent}/${file}`;
	if (type === "skills" && file === "SKILL.md") return parent;
	return file;
}

/** Group resolved resources by origin, scope, and source; packages first, user before project. */
export function buildGroups(resolved: ResolvedPaths, opts: ModelOptions): ResourceGroup[] {
	const homeDir = opts.homeDir ?? homedir();
	const configDirName = opts.configDirName ?? ".pi";
	const groups = new Map<string, ResourceGroup>();
	for (const type of RESOURCE_TYPES) {
		for (const { path, enabled, metadata } of resolved[type] ?? []) {
			const key = `${metadata.origin}:${metadata.scope}:${metadata.source}:${metadata.baseDir ?? ""}`;
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					label: groupLabel(metadata, opts.agentDir, configDirName, homeDir),
					scope: metadata.scope,
					origin: metadata.origin,
					source: metadata.source,
					subgroups: [],
				};
				groups.set(key, group);
			}
			let sub = group.subgroups.find((s) => s.type === type);
			if (!sub) {
				sub = { type, label: RESOURCE_TYPE_LABELS[type], items: [] };
				group.subgroups.push(sub);
			}
			sub.items.push({ path, enabled, metadata, resourceType: type, displayName: displayNameFor(path, type) });
		}
	}
	const out = [...groups.values()].sort((a, b) => {
		if (a.origin !== b.origin) return a.origin === "package" ? -1 : 1;
		if (a.scope !== b.scope) return a.scope === "user" ? -1 : 1;
		return a.source.localeCompare(b.source);
	});
	for (const g of out) {
		g.subgroups.sort((a, b) => RESOURCE_TYPES.indexOf(a.type) - RESOURCE_TYPES.indexOf(b.type));
		for (const s of g.subgroups) s.items.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}
	return out;
}

const patternTarget = (entry: string): string => (/^[!+-]/.test(entry) ? entry.slice(1) : entry);
const isForced = (entry: string): boolean => /^[!+-]/.test(entry);

export class ConfigModel {
	private readonly groupsByScope: Record<WriteScope, ResourceGroup[]>;
	private readonly inheritedEnabled = new Map<string, boolean>();
	private readonly settings: SettingsPort;
	private readonly cwd: string;
	private readonly agentDir: string;
	private readonly configDirName: string;
	private readonly homeDir: string;
	private readonly canonicalize: (p: string) => string;
	private scope: WriteScope;
	private flat: FlatEntry[] = [];
	private filtered: FlatEntry[] = [];
	private query = "";
	selectedIndex = 0;
	/** True once any toggle has written settings. */
	changed = false;

	constructor(
		resolvedByScope: Record<WriteScope, ResolvedPaths>,
		settings: SettingsPort,
		opts: ModelOptions,
		writeScope: WriteScope = "global",
	) {
		this.settings = settings;
		this.cwd = opts.cwd;
		this.agentDir = opts.agentDir;
		this.configDirName = opts.configDirName ?? ".pi";
		this.homeDir = opts.homeDir ?? homedir();
		this.canonicalize = opts.canonicalize ?? canonicalizeDefault;
		this.scope = writeScope;
		this.groupsByScope = {
			global: buildGroups(resolvedByScope.global, opts),
			project: buildGroups(resolvedByScope.project, opts),
		};
		for (const g of this.groupsByScope.global)
			for (const s of g.subgroups) for (const it of s.items) this.inheritedEnabled.set(this.itemKey(it), it.enabled);
		this.rebuild();
	}

	get writeScope(): WriteScope {
		return this.scope;
	}
	setWriteScope(scope: WriteScope): void {
		this.scope = scope;
		this.rebuild();
	}
	get entries(): readonly FlatEntry[] {
		return this.filtered;
	}
	get filter(): string {
		return this.query;
	}
	setFilter(query: string): void {
		this.query = query;
		this.applyFilter();
	}
	get selected(): FlatEntry | undefined {
		return this.filtered[this.selectedIndex];
	}

	/** Move selection to the next item entry in `direction`, staying put at the ends. */
	move(direction: 1 | -1): void {
		let i = this.selectedIndex + direction;
		while (i >= 0 && i < this.filtered.length) {
			if (this.filtered[i].type === "item") {
				this.selectedIndex = i;
				return;
			}
			i += direction;
		}
	}
	/** Jump by `count` entries, then settle on the nearest item back toward the selection. */
	page(direction: 1 | -1, count: number): void {
		let target = Math.max(0, Math.min(this.filtered.length - 1, this.selectedIndex + direction * count));
		while (target >= 0 && target < this.filtered.length && this.filtered[target].type !== "item") target -= direction;
		if (target >= 0 && target < this.filtered.length) this.selectedIndex = target;
	}

	view(item: ResourceItem): ItemView {
		const override = this.overrideState(item);
		const inheritedGlobal = this.isInheritedGlobal(item);
		return {
			enabled: item.enabled,
			override,
			inheritedGlobal,
			dimmed: this.scope === "project" && inheritedGlobal && override === "inherit",
			togglable: this.scope === "project" || this.itemScope(item) === "user",
		};
	}

	/** Toggle the selected item; returns the new enabled state, or undefined when nothing changed. */
	toggleSelected(): boolean | undefined {
		const entry = this.selected;
		if (entry?.type !== "item" || !this.view(entry.item).togglable) return undefined;
		const item = entry.item;
		let enabled: boolean;
		if (this.scope === "project") {
			const state = this.nextOverride(item);
			if (!this.setProjectOverride(item, state)) return undefined;
			enabled = state === "inherit" ? this.inheritedFor(item) : state === "load";
		} else {
			enabled = !item.enabled;
			if (item.metadata.origin === "top-level") this.toggleTopLevel(item, enabled);
			else this.togglePackage(item, enabled);
		}
		this.changed = true;
		item.enabled = enabled;
		for (const g of this.groups)
			for (const s of g.subgroups)
				for (const it of s.items) if (it.path === item.path && it.resourceType === item.resourceType) it.enabled = enabled;
		return enabled;
	}

	// ---- internals ----

	private get groups(): ResourceGroup[] {
		return this.groupsByScope[this.scope];
	}

	private rebuild(): void {
		this.flat = [];
		for (const group of this.groups) {
			this.flat.push({ type: "group", group });
			for (const subgroup of group.subgroups) {
				this.flat.push({ type: "subgroup", subgroup, group });
				for (const item of subgroup.items) this.flat.push({ type: "item", item });
			}
		}
		this.applyFilter();
	}

	private applyFilter(): void {
		// Like pi: trim only decides emptiness; the match uses the raw query.
		const q = this.query.toLowerCase();
		if (!q.trim()) {
			this.filtered = [...this.flat];
		} else {
			const items = new Set<ResourceItem>();
			for (const e of this.flat) {
				if (e.type !== "item") continue;
				const it = e.item;
				if (
					it.displayName.toLowerCase().includes(q) ||
					it.resourceType.includes(q) ||
					it.path.toLowerCase().includes(q)
				)
					items.add(it);
			}
			const subs = new Set<ResourceSubgroup>();
			const groups = new Set<ResourceGroup>();
			for (const g of this.groups)
				for (const s of g.subgroups)
					for (const it of s.items)
						if (items.has(it)) {
							subs.add(s);
							groups.add(g);
						}
			this.filtered = this.flat.filter(
				(e) =>
					(e.type === "group" && groups.has(e.group)) ||
					(e.type === "subgroup" && subs.has(e.subgroup)) ||
					(e.type === "item" && items.has(e.item)),
			);
		}
		const first = this.filtered.findIndex((e) => e.type === "item");
		this.selectedIndex = first >= 0 ? first : 0;
	}

	private itemKey(item: ResourceItem): string {
		return `${item.resourceType}:${this.canonicalize(item.path)}`;
	}
	private itemScope(item: ResourceItem): "user" | "project" {
		return item.metadata.scope === "project" ? "project" : "user";
	}
	private topLevelBaseDir(scope: "user" | "project"): string {
		return scope === "project" ? join(this.cwd, this.configDirName) : this.agentDir;
	}
	private inheritedFor(item: ResourceItem): boolean {
		return this.inheritedEnabled.get(this.itemKey(item)) ?? (this.itemScope(item) === "user" ? item.enabled : true);
	}
	private isInheritedGlobal(item: ResourceItem): boolean {
		return this.itemScope(item) === "user" || this.inheritedEnabled.has(this.itemKey(item));
	}

	/** Pattern relative to the resource's own base dir (top-level) or package root. */
	private resourcePattern(item: ResourceItem): string {
		const base = item.metadata.baseDir ?? this.topLevelBaseDir(this.itemScope(item));
		return relative(base, item.path);
	}
	private packagePattern(item: ResourceItem): string {
		return relative(item.metadata.baseDir ?? dirname(item.path), item.path);
	}
	private patternForScope(item: ResourceItem, scope: "user" | "project"): string {
		if (scope !== this.itemScope(item)) return item.path;
		return this.resourcePattern(item);
	}
	private topLevelOverridePatterns(item: ResourceItem, scope: "user" | "project"): Set<string> {
		const set = new Set([this.patternForScope(item, scope), item.path, relative(this.topLevelBaseDir(scope), item.path)]);
		if (item.metadata.baseDir) set.add(relative(item.metadata.baseDir, item.path));
		return set;
	}

	private toggleTopLevel(item: ResourceItem, enabled: boolean): void {
		const scope = this.itemScope(item);
		const settings = scope === "project" ? this.settings.getProjectSettings() : this.settings.getGlobalSettings();
		const pattern = this.resourcePattern(item);
		const updated = (settings[item.resourceType] ?? []).filter((p) => patternTarget(p) !== pattern);
		updated.push(`${enabled ? "+" : "-"}${pattern}`);
		this.settings.setPaths(scope === "project" ? "project" : "global", item.resourceType, updated);
	}

	private togglePackage(item: ResourceItem, enabled: boolean): void {
		const scope = this.itemScope(item);
		const settings = scope === "project" ? this.settings.getProjectSettings() : this.settings.getGlobalSettings();
		const packages = [...(settings.packages ?? [])];
		const idx = packages.findIndex((p) => (typeof p === "string" ? p : p.source) === item.metadata.source);
		if (idx === -1) return;
		const pkg: PackageObject = typeof packages[idx] === "string" ? { source: packages[idx] as string } : { ...(packages[idx] as PackageObject) };
		packages[idx] = pkg;
		const pattern = this.packagePattern(item);
		const updated = (pkg[item.resourceType] ?? []).filter((p) => patternTarget(p) !== pattern);
		updated.push(`${enabled ? "+" : "-"}${pattern}`);
		pkg[item.resourceType] = updated;
		this.settings.setPackages(scope === "project" ? "project" : "global", packages);
	}

	private overrideState(item: ResourceItem): OverrideState {
		if (this.scope !== "project") return "inherit";
		if (item.metadata.origin === "top-level") {
			return this.stateFromEntries(
				this.settings.getProjectSettings()[item.resourceType] ?? [],
				this.topLevelOverridePatterns(item, "project"),
				false,
			);
		}
		const pkg = this.findPackage(item, "project");
		if (typeof pkg !== "object") return "inherit";
		const entries = pkg[item.resourceType];
		if (entries === undefined) return "inherit";
		return this.stateFromEntries(entries, new Set([this.packagePattern(item)]), pkg.autoload !== false);
	}
	private stateFromEntries(entries: string[], patterns: Set<string>, emptyIsUnload: boolean): OverrideState {
		if (entries.length === 0 && emptyIsUnload) return "unload";
		let state: OverrideState = "inherit";
		for (const e of entries) {
			if (!patterns.has(patternTarget(e))) continue;
			state = e.startsWith("!") || e.startsWith("-") ? "unload" : "load";
		}
		return state;
	}
	private nextOverride(item: ResourceItem): OverrideState {
		const state = this.overrideState(item);
		const inherited = this.inheritedFor(item);
		if (state === "inherit") return inherited ? "unload" : "load";
		if (state === "unload") return inherited ? "load" : "inherit";
		return inherited ? "inherit" : "unload";
	}

	private setProjectOverride(item: ResourceItem, state: OverrideState): boolean {
		return item.metadata.origin === "top-level"
			? this.setProjectTopLevel(item, state)
			: this.setProjectPackage(item, state);
	}
	private setProjectTopLevel(item: ResourceItem, state: OverrideState): boolean {
		const current = this.settings.getProjectSettings()[item.resourceType] ?? [];
		const inherited = this.isInheritedGlobal(item);
		const pattern = inherited ? item.path : this.patternForScope(item, "project");
		const patterns = this.topLevelOverridePatterns(item, "project");
		const updated = current.filter((entry) => {
			const target = patternTarget(entry);
			if (isForced(entry) && patterns.has(target)) return false;
			return !(state === "inherit" && inherited && target === pattern);
		});
		if (state !== "inherit") {
			if (inherited && !updated.includes(pattern)) updated.push(pattern);
			updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
		}
		this.settings.setPaths("project", item.resourceType, updated);
		return true;
	}
	private setProjectPackage(item: ResourceItem, state: OverrideState): boolean {
		const packages = [...(this.settings.getProjectSettings().packages ?? [])];
		let idx = packages.findIndex((p) =>
			this.sameSource(item.metadata.source, this.itemScope(item), typeof p === "string" ? p : p.source, "project"),
		);
		if (idx === -1) {
			if (state === "inherit") return false;
			packages.push(this.overrideSourceFor(item));
			idx = packages.length - 1;
		}
		const pkg: PackageObject = typeof packages[idx] === "string" ? { source: packages[idx] as string } : { ...(packages[idx] as PackageObject) };
		packages[idx] = pkg;
		const pattern = this.packagePattern(item);
		const updated = (pkg[item.resourceType] ?? []).filter((e) => patternTarget(e) !== pattern);
		if (state !== "inherit") updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
		if (updated.length > 0) pkg[item.resourceType] = updated;
		else delete pkg[item.resourceType];
		if (!RESOURCE_TYPES.some((k) => pkg[k] !== undefined)) {
			if (pkg.autoload === false) packages.splice(idx, 1);
			else packages[idx] = pkg.source;
		}
		this.settings.setPackages("project", packages);
		return true;
	}

	private overrideSourceFor(item: ResourceItem): PackageObject {
		const source = item.metadata.source;
		if (!isLocalPath(source)) return { source, autoload: false };
		const abs = resolvePathLike(source, this.topLevelBaseDir(this.itemScope(item)), this.homeDir);
		return { source: relative(this.topLevelBaseDir("project"), abs) || ".", autoload: false };
	}
	private sameSource(a: string, aScope: "user" | "project", b: string, bScope: "user" | "project"): boolean {
		if (a === b) return true;
		if (!isLocalPath(a) || !isLocalPath(b)) return false;
		return (
			resolvePathLike(a, this.topLevelBaseDir(aScope), this.homeDir) ===
			resolvePathLike(b, this.topLevelBaseDir(bScope), this.homeDir)
		);
	}
	private findPackage(item: ResourceItem, scope: WriteScope): PackageSource | undefined {
		const settings = scope === "project" ? this.settings.getProjectSettings() : this.settings.getGlobalSettings();
		const sourceScope = scope === "project" ? "project" : "user";
		return (settings.packages ?? []).find((p) =>
			this.sameSource(item.metadata.source, this.itemScope(item), typeof p === "string" ? p : p.source, sourceScope),
		);
	}
}
