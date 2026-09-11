import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChrome } from "../src/chrome.ts";
import { countEstate, type EstateCounts } from "../src/estate.ts";

vi.mock("../src/estate.ts", () => ({ countEstate: vi.fn() }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

async function startChrome() {
	type Header = { render(width: number): string[]; dispose?(): void };
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void | Promise<void>>();
	const requestRender = vi.fn();
	let header!: Header;
	const pi = {
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>) => handlers.set(event, handler),
		getCommands: () => [{ source: "skill" }],
		exec: async () => ({ code: 1, stdout: "" }),
	};
	const ctx = {
		hasUI: true,
		mode: "tui",
		cwd: "/fixture-project",
		isProjectTrusted: () => true,
		ui: {
			theme: { fg: (_color: string, text: string) => text },
			setWorkingIndicator() {},
			setFooter() {},
			setHeader(factory: (tui: unknown, theme: unknown) => Header) {
				header?.dispose?.();
				header = factory({ requestRender }, { fg: (_color: string, text: string) => text, bold: (text: string) => text });
			},
		},
	} as unknown as ExtensionContext;
	registerChrome(pi as unknown as ExtensionAPI);
	const start = () => handlers.get("session_start")!({}, ctx);
	await start();
	return {
		get header() { return header; },
		requestRender,
		start,
		shutdown: () => handlers.get("session_shutdown")?.({}, ctx),
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(countEstate).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("header estate refresh", () => {
	it("renders while a slow inbox read is pending, then publishes the counts", async () => {
		const read = deferred<EstateCounts>();
		vi.mocked(countEstate).mockReturnValue(read.promise);
		const ui = await startChrome();
		expect(countEstate).toHaveBeenCalledTimes(1);
		expect(ui.header.render(100).join("\n")).toContain("skills 1");
		expect(ui.header.render(100).join("\n")).not.toContain("inbox");
		await vi.advanceTimersByTimeAsync(1_500);
		expect(ui.header.render(100).join("\n")).toContain("fixture-project");
		read.resolve({ extensions: 8, inboxNotes: 17 });
		await vi.advanceTimersByTimeAsync(0);
		expect(ui.header.render(100).join("\n")).toContain("extensions 8 · inbox 17");
		expect(ui.requestRender).toHaveBeenCalledOnce();
		ui.header.dispose?.();
	});

	it("keeps cached counts during refresh and allows only one read at a time", async () => {
		vi.mocked(countEstate).mockReturnValue(Promise.resolve({ inboxNotes: 17 }));
		const ui = await startChrome();
		await vi.advanceTimersByTimeAsync(0);
		const read = deferred<EstateCounts>();
		vi.mocked(countEstate).mockReturnValue(read.promise);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(countEstate).toHaveBeenCalledTimes(2);
		for (let i = 0; i < 100; i++) expect(ui.header.render(100).join("\n")).toContain("inbox 17");
		await vi.advanceTimersByTimeAsync(90_000);
		expect(countEstate).toHaveBeenCalledTimes(2);
		read.resolve({ inboxNotes: 18 });
		await vi.advanceTimersByTimeAsync(0);
		expect(ui.header.render(100).join("\n")).toContain("inbox 18");
		ui.header.dispose?.();
	});

	it("does not request idle redraws when the counts are unchanged", async () => {
		vi.mocked(countEstate).mockResolvedValue({ inboxNotes: 17 });
		const ui = await startChrome();
		await vi.advanceTimersByTimeAsync(0);
		expect(ui.requestRender).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(countEstate).toHaveBeenCalledTimes(3);
		expect(ui.requestRender).toHaveBeenCalledOnce();
		ui.header.dispose?.();
	});

	it("retains the snapshot after a rejected refresh and retries next interval", async () => {
		vi.mocked(countEstate).mockReturnValue(Promise.resolve({ inboxNotes: 17 }));
		const ui = await startChrome();
		await vi.advanceTimersByTimeAsync(0);
		const read = deferred<EstateCounts>();
		vi.mocked(countEstate).mockReturnValue(read.promise);
		await vi.advanceTimersByTimeAsync(30_000);
		read.reject(new Error("read failed"));
		await vi.advanceTimersByTimeAsync(0);
		expect(ui.header.render(100).join("\n")).toContain("inbox 17");
		vi.mocked(countEstate).mockReturnValue(Promise.resolve({ inboxNotes: 18 }));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ui.header.render(100).join("\n")).toContain("inbox 18");
		ui.header.dispose?.();
	});

	it.each(["dispose", "shutdown", "replacement"])("stops refreshes and ignores late results after %s", async (action) => {
		const read = deferred<EstateCounts>();
		vi.mocked(countEstate).mockReturnValue(read.promise);
		const ui = await startChrome();
		const oldHeader = ui.header;
		if (action === "dispose") ui.header.dispose?.();
		if (action === "shutdown") ui.shutdown();
		if (action === "replacement") {
			vi.mocked(countEstate).mockReturnValue(new Promise(() => {}));
			await ui.start();
		}
		const calls = vi.mocked(countEstate).mock.calls.length;
		read.resolve({ inboxNotes: 99 });
		await vi.advanceTimersByTimeAsync(90_000);
		expect(countEstate).toHaveBeenCalledTimes(calls);
		expect(ui.requestRender).not.toHaveBeenCalled();
		expect(oldHeader.render(100).join("\n")).not.toContain("inbox 99");
		ui.header.dispose?.();
	});
});
