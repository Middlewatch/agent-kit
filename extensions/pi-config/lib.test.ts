/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildGroups,
	ConfigModel,
	displayNameFor,
	type PackageSource,
	type ResolvedPaths,
	type ResourceItem,
	type ResourceType,
	type ScopeSettings,
	type SettingsPort,
	type WriteScope,
} from "./lib.ts";

const HOME = "/srv/u";
const AGENT_DIR = `${HOME}/.pi/agent`;
const CWD = "/w/proj";
const OPTS = { cwd: CWD, agentDir: AGENT_DIR, homeDir: HOME, canonicalize: (p: string) => p };

const NPM_EXT = "/pkgs/pkg/extensions/a.ts";
const NPM_SKILL = "/pkgs/pkg/skills/foo/SKILL.md";
const USER_EXT = `${AGENT_DIR}/extensions/foo.ts`;
const KIT_EXT = `${HOME}/.agents/kit/extensions/todo/index.ts`;
const PROJ_EXT = `${CWD}/.pi/extensions/local.ts`;

function empty(): ResolvedPaths {
	return { extensions: [], skills: [], prompts: [], themes: [] };
}

function fixture(): Record<WriteScope, ResolvedPaths> {
	const npm = { source: "npm:pkg", scope: "user" as const, origin: "package" as const, baseDir: "/pkgs/pkg" };
	const kit = { source: "~/.agents/kit", scope: "user" as const, origin: "package" as const, baseDir: `${HOME}/.agents/kit` };
	const user = { source: "auto", scope: "user" as const, origin: "top-level" as const };
	const global = empty();
	global.extensions.push(
		{ path: NPM_EXT, enabled: true, metadata: npm },
		{ path: USER_EXT, enabled: true, metadata: user },
		{ path: KIT_EXT, enabled: true, metadata: kit },
	);
	global.skills.push({ path: NPM_SKILL, enabled: true, metadata: npm });
	const project = structuredClone(global);
	project.extensions.push({
		path: PROJ_EXT,
		enabled: true,
		metadata: { source: "auto", scope: "project", origin: "top-level" },
	});
	return { global, project };
}

class MemorySettings implements SettingsPort {
	global: ScopeSettings;
	project: ScopeSettings;
	writes = 0;
	constructor(global: ScopeSettings = {}, project: ScopeSettings = {}) {
		this.global = global;
		this.project = project;
	}
	getGlobalSettings() {
		return structuredClone(this.global);
	}
	getProjectSettings() {
		return structuredClone(this.project);
	}
	setPaths(scope: WriteScope, type: ResourceType, paths: string[]) {
		this.writes++;
		this[scope][type] = paths;
	}
	setPackages(scope: WriteScope, packages: PackageSource[]) {
		this.writes++;
		this[scope].packages = packages;
	}
}

function select(model: ConfigModel, path: string): ResourceItem {
	const i = model.entries.findIndex((e) => e.type === "item" && e.item.path === path);
	assert.ok(i >= 0, `item ${path} listed in ${model.writeScope} scope`);
	model.selectedIndex = i;
	const entry = model.selected;
	assert.ok(entry?.type === "item");
	return entry.item;
}

test("displayNameFor: skill folders, nested extensions, plain files", () => {
	assert.equal(displayNameFor(NPM_SKILL, "skills"), "foo");
	assert.equal(displayNameFor(KIT_EXT, "extensions"), "todo/index.ts");
	assert.equal(displayNameFor(NPM_EXT, "extensions"), "a.ts");
	assert.equal(displayNameFor("/x/prompts/review.md", "prompts"), "review.md");
});

test("buildGroups orders packages before top-level, user before project, and labels like pi config", () => {
	const groups = buildGroups(fixture().project, OPTS);
	assert.deepEqual(
		groups.map((g) => g.label),
		// localeCompare orders "~" before letters, as pi's picker does
		["~/.agents/kit (user)", "npm:pkg (user)", "User (~/.pi/agent/)", "Project (.pi/)"],
	);
	assert.deepEqual(
		groups[1].subgroups.map((s) => s.label),
		["Extensions", "Skills"],
	);
});

test("global scope: toggling a package resource writes the object form with -path, then +path", () => {
	const settings = new MemorySettings({ packages: ["npm:pkg"] });
	const model = new ConfigModel(fixture(), settings, OPTS);
	select(model, NPM_EXT);
	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.global.packages, [{ source: "npm:pkg", extensions: ["-extensions/a.ts"] }]);
	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.global.packages, [{ source: "npm:pkg", extensions: ["+extensions/a.ts"] }]);
	assert.equal(model.changed, true);
});

test("global scope: toggling a user top-level resource replaces any entry for it with -pattern", () => {
	// Patterns are relative to the agent dir, so the existing plain entry is replaced by the force entry.
	const settings = new MemorySettings({ extensions: ["extensions/foo.ts", "other.ts"] });
	const model = new ConfigModel(fixture(), settings, OPTS);
	select(model, USER_EXT);
	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.global.extensions, ["other.ts", "-extensions/foo.ts"]);
});

test("global scope: project-scoped items are listed read-only", () => {
	const settings = new MemorySettings();
	const model = new ConfigModel(fixture(), settings, OPTS);
	assert.equal(model.entries.some((e) => e.type === "item" && e.item.path === PROJ_EXT), false);
	model.setWriteScope("project");
	assert.equal(model.view(select(model, PROJ_EXT)).togglable, true);
	model.setWriteScope("global");
	assert.equal(model.changed, false);
	assert.equal(settings.writes, 0);
});

test("project scope: inherited npm package cycles unload -> load -> inherit as an autoload:false delta", () => {
	const settings = new MemorySettings({ packages: ["npm:pkg"] });
	const model = new ConfigModel(fixture(), settings, OPTS, "project");
	const item = select(model, NPM_EXT);
	assert.deepEqual(model.view(item), { enabled: true, override: "inherit", inheritedGlobal: true, dimmed: true, togglable: true });

	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.project.packages, [{ source: "npm:pkg", autoload: false, extensions: ["-extensions/a.ts"] }]);
	assert.equal(model.view(item).override, "unload");

	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.packages, [{ source: "npm:pkg", autoload: false, extensions: ["+extensions/a.ts"] }]);
	assert.equal(model.view(item).override, "load");

	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.packages, []);
	assert.equal(model.view(item).override, "inherit");
	assert.deepEqual(settings.global.packages, ["npm:pkg"]);
});

test("project scope: a local package override is written relative to <cwd>/.pi", () => {
	const settings = new MemorySettings({ packages: ["~/.agents/kit"] });
	const model = new ConfigModel(fixture(), settings, OPTS, "project");
	select(model, KIT_EXT);
	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.project.packages, [
		{ source: "../../../srv/u/.agents/kit", autoload: false, extensions: ["-extensions/todo/index.ts"] },
	]);
	// The relative entry is recognised as the same package on the next toggle.
	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.packages, [
		{ source: "../../../srv/u/.agents/kit", autoload: false, extensions: ["+extensions/todo/index.ts"] },
	]);
});

test("project scope: an inherited user top-level resource is pinned by absolute path plus a force entry", () => {
	const settings = new MemorySettings();
	const model = new ConfigModel(fixture(), settings, OPTS, "project");
	select(model, USER_EXT);
	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.project.extensions, [USER_EXT, `-${USER_EXT}`]);
	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.extensions, [USER_EXT, `+${USER_EXT}`]);
	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.extensions, []);
});

test("project scope: a project-local resource toggles by its .pi-relative pattern and is not dimmed", () => {
	const settings = new MemorySettings();
	const model = new ConfigModel(fixture(), settings, OPTS, "project");
	const item = select(model, PROJ_EXT);
	assert.deepEqual(model.view(item), { enabled: true, override: "inherit", inheritedGlobal: false, dimmed: false, togglable: true });
	assert.equal(model.toggleSelected(), false);
	assert.deepEqual(settings.project.extensions, ["-extensions/local.ts"]);
	assert.equal(model.view(item).override, "unload");
});

test("project scope: existing project settings are read back as the starting override state", () => {
	const settings = new MemorySettings({ packages: ["npm:pkg"] }, { packages: [{ source: "npm:pkg", autoload: false, skills: ["-skills/foo/SKILL.md"] }] });
	const model = new ConfigModel(fixture(), settings, OPTS, "project");
	const item = select(model, NPM_SKILL);
	assert.equal(model.view(item).override, "unload");
	// unload with inherited=true steps to load
	assert.equal(model.toggleSelected(), true);
	assert.deepEqual(settings.project.packages, [{ source: "npm:pkg", autoload: false, skills: ["+skills/foo/SKILL.md"] }]);
});

test("filter narrows to matching items with their group and subgroup headers; selection lands on an item", () => {
	const model = new ConfigModel(fixture(), new MemorySettings(), OPTS);
	model.setFilter("todo");
	assert.deepEqual(
		model.entries.map((e) => (e.type === "item" ? e.item.displayName : e.type === "group" ? `G:${e.group.label}` : `S:${e.subgroup.label}`)),
		["G:~/.agents/kit (user)", "S:Extensions", "todo/index.ts"],
	);
	assert.equal(model.selected?.type, "item");
	// pi matches the raw query, so surrounding spaces are literal
	model.setFilter(" todo ");
	assert.deepEqual(model.entries, []);
	model.setFilter("   ");
	assert.equal(model.entries.length, 11);
	model.setFilter("");
	// npm:pkg (group, 2 subgroups, 2 items) + kit (group, subgroup, item) + user (group, subgroup, item)
	assert.equal(model.entries.length, 5 + 3 + 3);
});

test("move and page skip headers and stop at the ends", () => {
	const model = new ConfigModel(fixture(), new MemorySettings(), OPTS);
	const first = model.selectedIndex;
	assert.equal(model.selected?.type, "item");
	model.move(-1);
	assert.equal(model.selectedIndex, first);
	model.move(1);
	assert.equal(model.selected?.type, "item");
	assert.notEqual(model.selectedIndex, first);
	model.page(1, 100);
	assert.equal(model.selected?.type, "item");
	const last = model.selectedIndex;
	model.move(1);
	assert.equal(model.selectedIndex, last);
	model.page(-1, 100);
	assert.equal(model.selectedIndex, first);
	// A jump that lands on a header settles back toward the selection, as pi does.
	// Layout from `first`: item, group, subgroup, item; a jump onto a header walks back.
	model.page(1, 1);
	assert.equal(model.selectedIndex, first);
	model.page(1, 3);
	assert.equal(model.selectedIndex, first + 3);
});
