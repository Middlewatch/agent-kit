/**
 * Pi's stock prompt shapes, mirrored from the published package so the
 * extension can prove the incoming core is Pi's own before rewriting it.
 * Stock Pi hands `before_agent_start` the assembled prompt (possibly already
 * edited by an earlier extension) and the structured inputs, but not the
 * untouched original. Rebuilding the core from those inputs supplies that
 * provenance: a byte-equal reconstruction means nothing was inserted or
 * dropped. Any difference fails open.
 *
 * The prose below is Pi's, copied verbatim from
 * `packages/coding-agent/src/core/system-prompt.ts` at PINNED_PI_VERSION.
 * The conformance suite compares this mirror against the real builder, so a
 * Pi release that changes the core prose goes red there and the runtime
 * fails open until the mirror is re-pinned.
 */
import * as path from "node:path";
import type { InstructionFile } from "./instructions.ts";

export const PINNED_PI_VERSION = "0.85.1";

export const STOCK_FIRST_LINE =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";

export interface StockCoreInputs {
  selectedTools?: string[];
  toolSnippets?: Record<string, string>;
  promptGuidelines?: string[];
}

/** Installed documentation locations Pi writes into the core. */
export interface DocPaths {
  readme: string;
  docs: string;
  examples: string;
}

export function stockCore(inputs: StockCoreInputs, paths: DocPaths): string {
  const tools = inputs.selectedTools || ["read", "bash", "edit", "write"];
  const visibleTools = tools.filter((name) => !!inputs.toolSnippets?.[name]);
  const toolsList =
    visibleTools.length > 0
      ? visibleTools
          .map((name) => `- ${name}: ${inputs.toolSnippets![name]}`)
          .join("\n")
      : "(none)";

  const guidelinesList: string[] = [];
  const seen = new Set<string>();
  const addGuideline = (guideline: string): void => {
    if (seen.has(guideline)) return;
    seen.add(guideline);
    guidelinesList.push(guideline);
  };
  const hasBash = tools.includes("bash");
  const hasPowerShell = tools.includes("powershell");
  const hasGrep = tools.includes("grep");
  const hasFind = tools.includes("find");
  const hasLs = tools.includes("ls");
  if ((hasBash || hasPowerShell) && !hasGrep && !hasFind && !hasLs) {
    if (hasBash && hasPowerShell) {
      addGuideline(
        "Use bash or PowerShell for file operations like listing, searching, and finding files",
      );
    } else if (hasPowerShell) {
      addGuideline(
        "Use PowerShell for file operations like listing, searching, and finding files",
      );
    } else {
      addGuideline("Use bash for file operations like ls, rg, find");
    }
  }
  for (const guideline of inputs.promptGuidelines ?? []) {
    const normalized = guideline.trim();
    if (normalized.length > 0) addGuideline(normalized);
  }
  addGuideline("Be concise in your responses");
  addGuideline("Show file paths clearly when working with files");
  const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

  return `${STOCK_FIRST_LINE} You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${paths.readme}
- Additional docs: ${paths.docs}
- Examples: ${paths.examples} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
}

/**
 * The container stock Pi appends for loaded instruction files, byte for
 * byte, so the splice can lift it out of the tail. Paths are unescaped,
 * as in Pi.
 */
export function projectContext(
  files: readonly { path: string; content: string }[],
): string {
  if (files.length === 0) return "";
  let block =
    "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
  for (const file of files)
    block += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
  return block + "</project_context>\n";
}

/**
 * Recover each file's scope from where the loader found it. Pi loads the
 * global file from the agent directory and every other file from an
 * ancestor of the working directory (or a linked worktree's main root), so
 * the directory holding the file is its scope.
 */
export function scopeFiles(
  files: readonly { path: string; content: string }[],
  agentDir: string,
): InstructionFile[] {
  const globalDir = path.resolve(agentDir);
  return files.map((file) => {
    const directory = path.dirname(path.resolve(file.path));
    return directory === globalDir
      ? { path: file.path, content: file.content, scope: { kind: "global" } }
      : {
          path: file.path,
          content: file.content,
          scope: { kind: "workspace", directory },
        };
  });
}
