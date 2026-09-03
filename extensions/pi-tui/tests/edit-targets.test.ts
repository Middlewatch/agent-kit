import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEditRoots, filterTargets, scanMarkdown, type EditRoots } from "../src/edit-targets.ts";

/** Full fixture: skills, prompts, system, a sysprompt-style package, config roots. */
function fixtureRoots(): EditRoots {
	const base = mkdtempSync(join(tmpdir(), "pitui-roots-"));
	const roots: EditRoots = {
		agentsDir: join(base, "agents"),
		piAgentDir: join(base, "pi-agent"),
		cwd: join(base, "project"),
	};

	mkdirSync(join(roots.agentsDir, "skills", "harvest"), { recursive: true });
	writeFileSync(join(roots.agentsDir, "skills", "harvest", "SKILL.md"), "# harvest");
	mkdirSync(join(roots.agentsDir, "skills", "empty-dir"), { recursive: true });
	// The estate links freely: a symlinked skill dir must still count.
	const linkedSkill = join(base, "linked-skill");
	mkdirSync(linkedSkill, { recursive: true });
	writeFileSync(join(linkedSkill, "SKILL.md"), "# linked");
	symlinkSync(linkedSkill, join(roots.agentsDir, "skills", "adr"));

	mkdirSync(join(roots.piAgentDir, "prompts"), { recursive: true });
	writeFileSync(join(roots.piAgentDir, "prompts", "review.md"), "review");
	writeFileSync(join(roots.piAgentDir, "SYSTEM.md"), "system");

	mkdirSync(join(roots.cwd, ".pi", "prompts"), { recursive: true });
	writeFileSync(join(roots.cwd, ".pi", "prompts", "local.md"), "local");

	// A settings package with a guidance/sysprompt/ dir (the kit shape).
	const pkg = join(base, "kit");
	mkdirSync(join(pkg, "guidance", "sysprompt"), { recursive: true });
	writeFileSync(join(pkg, "guidance", "sysprompt", "default.md"), "core");
	writeFileSync(join(pkg, "guidance", "sysprompt", "owner.md"), "core");
	writeFileSync(join(pkg, "guidance", "sysprompt", ".active"), "owner"); // pointer, not a target
	// A second package without templates: contributes no root.
	const bare = join(base, "bare-pkg");
	mkdirSync(bare, { recursive: true });
	writeFileSync(
		join(roots.piAgentDir, "settings.json"),
		JSON.stringify({ packages: [pkg, bare] }),
	);

	// Config-mapped root with nested files and excluded noise.
	const wiki = join(base, "wiki");
	mkdirSync(join(wiki, "lanes", "zig"), { recursive: true });
	mkdirSync(join(wiki, ".git"), { recursive: true });
	mkdirSync(join(wiki, "node_modules", "x"), { recursive: true });
	writeFileSync(join(wiki, "README.md"), "wiki");
	writeFileSync(join(wiki, "lanes", "zig", "CONVENTIONS.md"), "zig");
	writeFileSync(join(wiki, "lanes", "notes.txt"), "not markdown");
	writeFileSync(join(wiki, ".git", "junk.md"), "hidden");
	writeFileSync(join(wiki, "node_modules", "x", "dep.md"), "dep");
	writeFileSync(
		join(roots.piAgentDir, "pi-tui-edit.json"),
		JSON.stringify({ roots: [{ label: "wiki", path: wiki }, { label: "ghost", path: join(base, "nope") }] }),
	);

	return roots;
}

describe("discoverEditRoots", () => {
	const roots = fixtureRoots();
	const specs = discoverEditRoots(roots);
	const byLabel = new Map(specs.map((s) => [s.label, s]));

	it("offers skills, prompts, system, sysprompt package, config, and mapped roots", () => {
		expect([...byLabel.keys()]).toEqual([
			"skills",
			"prompts: global",
			"prompts: project",
			"system",
			"sysprompt: kit",
			"wiki",
			"config",
		]);
	});

	it("finds skills with a SKILL.md, following symlinks, and skips bare directories", () => {
		const skills = byLabel.get("skills")!.targets;
		expect(skills.map((t) => t.label)).toEqual(["adr", "harvest"]);
		expect(skills[1].path).toBe(join(roots.agentsDir, "skills", "harvest", "SKILL.md"));
	});

	it("finds global and project prompt templates", () => {
		expect(byLabel.get("prompts: global")!.targets[0].path).toBe(join(roots.piAgentDir, "prompts", "review.md"));
		expect(byLabel.get("prompts: project")!.targets[0].path).toBe(join(roots.cwd, ".pi", "prompts", "local.md"));
	});

	it("always offers the four system prompt slots, marking missing ones", () => {
		const system = new Map(byLabel.get("system")!.targets.map((t) => [t.label, t]));
		expect(system.get("global")?.exists).toBe(true);
		expect(system.get("global append")?.exists).toBe(false);
		expect(system.get("global append")?.description).toBe("new file");
		expect(system.get("project")?.exists).toBe(false);
		expect(system.get("project append")?.exists).toBe(false);
	});

	it("probes settings packages for guidance/sysprompt/*.md", () => {
		const templates = byLabel.get("sysprompt: kit")!.targets;
		expect(templates.map((t) => t.label)).toEqual(["default", "owner"]);
	});

	it("scans config-mapped roots recursively, excluding dotdirs, node_modules, and non-markdown", () => {
		const wiki = byLabel.get("wiki")!.targets;
		expect(wiki.map((t) => t.label)).toEqual(["README.md", "lanes/zig/CONVENTIONS.md"]);
	});

	it("drops mapped roots whose directory is missing", () => {
		expect(byLabel.has("ghost")).toBe(false);
	});

	it("offers the config file itself, marked new when absent", () => {
		const config = byLabel.get("config")!.targets;
		expect(config).toHaveLength(1);
		expect(config[0].path).toBe(join(roots.piAgentDir, "pi-tui-edit.json"));
		expect(config[0].exists).toBe(true);
	});

	it("survives completely missing roots: only system and config remain", () => {
		const empty = mkdtempSync(join(tmpdir(), "pitui-roots-empty-"));
		const specs = discoverEditRoots({
			agentsDir: join(empty, "a"),
			piAgentDir: join(empty, "b"),
			cwd: join(empty, "c"),
		});
		expect(specs.map((s) => s.label)).toEqual(["system", "config"]);
		expect(specs.every((s) => s.targets.every((t) => !t.exists))).toBe(true);
	});
});

describe("scanMarkdown", () => {
	it("caps the file count", () => {
		const dir = mkdtempSync(join(tmpdir(), "pitui-scan-"));
		for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${String(i).padStart(2, "0")}.md`), "x");
		expect(scanMarkdown(dir, { cap: 10 })).toHaveLength(10);
	});
});

describe("filterTargets", () => {
	const targets = [
		{ label: "lanes/zig/CONVENTIONS.md", path: "/a", exists: true },
		{ label: "lanes/go/CONVENTIONS.md", path: "/b", exists: true },
		{ label: "README.md", path: "/c", exists: true },
	];

	it("matches label tokens across path segments", () => {
		expect(filterTargets(targets, "zig conv").map((t) => t.path)).toEqual(["/a"]);
	});

	it("returns everything for an empty query", () => {
		expect(filterTargets(targets, "")).toHaveLength(3);
	});
});
