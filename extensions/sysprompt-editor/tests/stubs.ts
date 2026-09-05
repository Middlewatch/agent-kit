/** Shared unit stubs. Real persistence and the real loader are covered by conformance. */
import {
  projectContext,
  scopeFiles,
  stockCore,
  type DocPaths,
} from "../lib/stock-core.ts";

/** Session-storage stub for unit wiring. */
export function sessionStub() {
  const entries: {
    type: string;
    customType: string;
    data: unknown;
    id: string;
  }[] = [];
  return {
    entries,
    appendEntry(customType: string, data: unknown) {
      entries.push({
        type: "custom",
        customType,
        data,
        id: String(entries.length),
      });
    },
    context(ctx: any = {}) {
      return {
        hasUI: true,
        ui: { notify() {} },
        ...ctx,
        sessionManager: {
          getSessionId: () => "unit-session",
          getLeafId: () => entries.at(-1)?.id ?? null,
          getBranch: () => [...entries],
        },
      };
    },
  };
}

/**
 * A stock prompt as Pi 0.85.1 builds it from these inputs. The handler
 * accepts a core only when it equals this reconstruction, so tests build
 * their prompts from the same pieces.
 */
export const AGENT_DIR = "/g";
export const DOC_PATHS: DocPaths = {
  readme: "/p/README.md",
  docs: "/p/docs",
  examples: "/p/examples",
};
export const STOCK_OPTIONS = {
  cwd: "/tmp",
  selectedTools: ["read", "bash"],
  toolSnippets: { read: "Read", bash: "Execute bash commands" },
};
export const STOCK_CORE = stockCore(STOCK_OPTIONS, DOC_PATHS);
export const TOOLS = "- read: Read\n- bash: Execute bash commands";
export const GUIDELINES =
  "- Use bash for file operations like ls, rg, find\n- Be concise in your responses\n- Show file paths clearly when working with files";
export const DOCS = STOCK_CORE.slice(STOCK_CORE.indexOf("Pi documentation ("));

/** One global instruction file, its stock container, and its scoped form. */
export const FILES = [{ path: "/g/AGENTS.md", content: "stub" }];
export const CONTEXT = projectContext(FILES);
export const SCOPED = scopeFiles(FILES, AGENT_DIR);
export const GLOBAL_BLOCK =
  '<global_instructions path="/g/AGENTS.md">\nstub\n</global_instructions>';
