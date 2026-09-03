import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	countEstate,
	countExtensions,
	countInboxNotes,
	countPackageExtensions,
	resolvePackageRef,
	type EstateSources,
} from "../src/estate.ts";

/**
 * Fixture mirroring pi's discovery inputs:
 * - global auto-discovery dir: one root .ts + one subdir index.ts     = 2
 * - project .pi/extensions (trusted only): one root .ts               = 1
 * - user settings `extensions`: one existing file                     = 1
 * - user settings `packages`:
 *   - local path package with pi.extensions manifest (2 files)        = 2
 *   - npm package cached under npm/node_modules, manifest (1 file)    = 1
 *   - git package cached under git/<host>/<path>, convention dir      = 2
 *   - filtered package (`extensions: []`)                             = 0
 * - project settings re-lists the local package (dedupe, not +2)
 * trusted total = 9, untrusted total = 8
 */
function fixture(): { sources: EstateSources; dir: string } {
	const dir = mkdtempSync(join(tmpdir(), "pitui-estate-"));
	const piAgentDir = join(dir, "pi-agent");
	const cwd = join(dir, "project");

	// global auto-discovery dir
	mkdirSync(join(piAgentDir, "extensions", "sub"), { recursive: true });
	writeFileSync(join(piAgentDir, "extensions", "root.ts"), "");
	writeFileSync(join(piAgentDir, "extensions", "sub", "index.ts"), "");
	mkdirSync(join(piAgentDir, "extensions", "not-an-extension"), { recursive: true });
	writeFileSync(join(piAgentDir, "extensions", "not-an-extension", "notes.md"), "");

	// project auto-discovery dir
	mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
	writeFileSync(join(cwd, ".pi", "extensions", "local.ts"), "");

	// settings `extensions` entry
	const loose = join(dir, "loose.ts");
	writeFileSync(loose, "");

	// local path package with a pi.extensions manifest
	const kit = join(dir, "kit");
	mkdirSync(join(kit, "ext"), { recursive: true });
	writeFileSync(join(kit, "ext", "a.ts"), "");
	writeFileSync(join(kit, "ext", "b.ts"), "");
	writeFileSync(join(kit, "package.json"), JSON.stringify({ pi: { extensions: ["./ext/a.ts", "./ext/b.ts"] } }));

	// npm package cache
	const npmPkg = join(piAgentDir, "npm", "node_modules", "@scope", "tool");
	mkdirSync(npmPkg, { recursive: true });
	writeFileSync(join(npmPkg, "index.ts"), "");
	writeFileSync(join(npmPkg, "package.json"), JSON.stringify({ pi: { extensions: ["./index.ts"] } }));

	// git package cache, convention extensions/ dir (no pi manifest)
	const gitPkg = join(piAgentDir, "git", "example.com", "user", "repo");
	mkdirSync(join(gitPkg, "extensions"), { recursive: true });
	writeFileSync(join(gitPkg, "extensions", "one.ts"), "");
	writeFileSync(join(gitPkg, "extensions", "two.js"), "");
	writeFileSync(join(gitPkg, "package.json"), JSON.stringify({ name: "repo" }));

	// filtered package: would contribute, but extensions: [] disables it
	const filtered = join(dir, "filtered");
	mkdirSync(join(filtered, "extensions"), { recursive: true });
	writeFileSync(join(filtered, "extensions", "off.ts"), "");

	writeFileSync(
		join(piAgentDir, "settings.json"),
		JSON.stringify({
			extensions: [loose, join(dir, "missing.ts")],
			packages: [kit, "npm:@scope/tool@1.2.3", "git:example.com/user/repo@v1", { source: filtered, extensions: [] }],
		}),
	);
	// project settings re-list the same local package: identity dedupe
	writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [kit] }));

	// inbox
	mkdirSync(join(dir, "inbox"));
	writeFileSync(join(dir, "inbox", "README.md"), "readme");
	writeFileSync(join(dir, "inbox", "note-one.md"), "note");
	writeFileSync(join(dir, "inbox", "note-two.md"), "note");
	writeFileSync(join(dir, "inbox", "scratch.txt"), "not a note");

	return { sources: { agentsDir: dir, piAgentDir, cwd, projectTrusted: true }, dir };
}

describe("extension discovery mirror", () => {
	const { sources } = fixture();

	it("sums every discovery source when the project is trusted", () => {
		expect(countExtensions(sources)).toBe(9);
	});

	it("skips project-local dirs and settings when untrusted", () => {
		expect(countExtensions({ ...sources, projectTrusted: false })).toBe(8);
	});

	it("returns undefined when the pi agent dir is missing", () => {
		expect(countExtensions({ ...sources, piAgentDir: join(sources.piAgentDir, "nope") })).toBeUndefined();
	});
});

describe("package extension counts", () => {
	it("counts manifest file and directory entries", () => {
		const root = mkdtempSync(join(tmpdir(), "pitui-pkg-"));
		mkdirSync(join(root, "more"));
		writeFileSync(join(root, "one.ts"), "");
		writeFileSync(join(root, "more", "two.ts"), "");
		writeFileSync(join(root, "more", "three.js"), "");
		writeFileSync(join(root, "package.json"), JSON.stringify({ pi: { extensions: ["./one.ts", "./more"] } }));
		expect(countPackageExtensions(root)).toBe(3);
	});

	it("uses the extensions/ convention only without a pi manifest", () => {
		const root = mkdtempSync(join(tmpdir(), "pitui-pkg-"));
		mkdirSync(join(root, "extensions"));
		writeFileSync(join(root, "extensions", "conv.ts"), "");
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "plain" }));
		expect(countPackageExtensions(root)).toBe(1);
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "plain", pi: { skills: ["skills"] } }));
		expect(countPackageExtensions(root)).toBe(0);
	});
});

describe("package source resolution", () => {
	it("resolves npm specs to the scope's npm cache, version stripped", () => {
		const ref = resolvePackageRef("npm:@scope/tool@1.2.3", "/scope", "/cwd");
		expect(ref).toEqual({
			identity: "npm:@scope/tool",
			root: "/scope/npm/node_modules/@scope/tool",
			disabled: false,
		});
	});

	it("resolves git specs across spellings to one identity, ref stripped", () => {
		const spellings = [
			"git:example.com/user/repo@v1",
			"https://example.com/user/repo@v1",
			"git:git@example.com:user/repo@v1",
			"ssh://git@example.com/user/repo.git",
		];
		for (const source of spellings) {
			const ref = resolvePackageRef(source, "/scope", "/cwd");
			expect(ref?.identity, source).toBe("git:example.com/user/repo");
			expect(ref?.root, source).toBe("/scope/git/example.com/user/repo");
		}
	});

	it("marks packages with an empty extensions filter disabled", () => {
		expect(resolvePackageRef({ source: "npm:x" }, "/s", "/c")?.disabled).toBe(false);
		expect(resolvePackageRef({ source: "npm:x", extensions: [] }, "/s", "/c")?.disabled).toBe(true);
	});
});

describe("estate counts", () => {
	const { sources } = fixture();

	it("counts inbox markdown notes, README excluded", () => {
		expect(countInboxNotes(sources.agentsDir)).toBe(2);
	});

	it("returns undefined per count when a location is missing", () => {
		const empty = mkdtempSync(join(tmpdir(), "pitui-estate-empty-"));
		expect(countEstate({ agentsDir: empty, piAgentDir: join(empty, "pi"), cwd: empty, projectTrusted: false })).toEqual(
			{ extensions: undefined, inboxNotes: undefined },
		);
	});
});
