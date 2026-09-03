import { describe, expect, it } from "vitest";
import extension from "../src/index.ts";
import { editorCommand } from "../src/editor.ts";

describe("scaffold", () => {
	it("exports an extension factory", () => {
		expect(typeof extension).toBe("function");
	});

	it("picks VISUAL over EDITOR over nvim", () => {
		expect(editorCommand({ VISUAL: "code -w", EDITOR: "vi" } as NodeJS.ProcessEnv)).toBe("code -w");
		expect(editorCommand({ EDITOR: "vi" } as NodeJS.ProcessEnv)).toBe("vi");
		expect(editorCommand({} as NodeJS.ProcessEnv)).toBe("nvim");
	});
});
