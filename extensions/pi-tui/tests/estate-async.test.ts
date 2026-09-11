import * as fs from "node:fs";
import { readdir } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { countInboxNotes } from "../src/estate.ts";

vi.mock("node:fs", () => ({ readdirSync: vi.fn(() => []) }));
vi.mock("node:fs/promises", () => ({ readdir: vi.fn() }));

it("a pending inbox read leaves the event loop free and uses no synchronous directory read", async () => {
	let release!: (entries: unknown[]) => void;
	vi.mocked(readdir).mockReturnValue(new Promise((resolve) => { release = resolve; }) as never);
	const pending = countInboxNotes("/fixture-estate");
	expect(fs.readdirSync).not.toHaveBeenCalled();
	expect(pending).toBeInstanceOf(Promise);
	let completed = false;
	void Promise.resolve(pending).then(() => { completed = true; });
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(completed).toBe(false);
	release([
		{ name: "note.md", isFile: () => true },
		{ name: "another.md", isFile: () => true },
		{ name: "README.md", isFile: () => true },
		{ name: "folder.md", isFile: () => false },
	]);
	expect(await pending).toBe(2);
});
