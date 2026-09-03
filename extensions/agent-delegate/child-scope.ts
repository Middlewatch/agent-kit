import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { inspectFind, inspectGrep, inspectLs, inspectRead } from "./src/inspect.ts";
import { dispatchAcrossScopes, resolveReadablePath } from "./src/scope.ts";
import { editFile, gitCommit, writeFile } from "./src/write.ts";
import { inspectGitDiff, inspectGitStatus } from "./src/git-inspect.ts";
import { LoopDetector } from "./src/loop.ts";
import { emitMarker } from "./src/protocol.ts";
import { provenanceFromToolResult } from "./src/provenance.ts";
import { annotate } from "./src/scan.ts";
import {
  loadWebProviderConfig,
  QUERY_MAX_CHARS,
  SEARCH_LIMIT_MAX,
  webFetch,
  webSearch,
  type WebProviderConfig,
} from "./src/web.ts";

const INSPECT_TOOLS = ["inspect_read", "inspect_grep", "inspect_find", "inspect_ls", "inspect_git_status", "inspect_git_diff"] as const;
const WEB_TOOLS = ["web_search", "web_fetch"] as const;
const WRITE_TOOLS = ["write_file", "edit_file", "git_commit"] as const;

export const DEFAULT_TURN_CAP = 30;
const TURN_CAP_MIN = 1;
const TURN_CAP_MAX = 100;

const WRAP_UP_DIRECTIVE =
  "Stop calling tools and wrap up now: write your final answer from the evidence you already have, " +
  "noting what remains unverified.";

/** Parent-supplied cap, clamped to [1, 100]; malformed or absent values fall back to 30. */
export function resolveTurnCap(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_TURN_CAP;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_TURN_CAP;
  return Math.min(TURN_CAP_MAX, Math.max(TURN_CAP_MIN, parsed));
}

function toolResult(result: { text: string; truncated: boolean; visited?: number; omitted?: number }) {
  const { text, ...details } = result;
  return { content: [{ type: "text" as const, text }], details };
}

/**
 * Route a git-inspect directory through the same canonical containment and
 * secret checks the read tools use. The git tools run with cwd set to this
 * directory, so a raw `resolve(root, path)` would let a relative `../` escape
 * or an in-scope symlink run git in an out-of-scope repository; resolving the
 * dispatched target through resolveReadablePath refuses that before git runs.
 */
function resolveGitDir(roots: readonly string[], requestedPath: unknown): string {
  const target = dispatchAcrossScopes(roots, requestedPath);
  const decision = resolveReadablePath(target.root, target.path);
  if (!decision.allowed || !decision.path) throw new Error(decision.reason ?? "git inspection path denied");
  return decision.path;
}

function eventResultText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .join("\n");
}

export default function childScope(pi: ExtensionAPI): void {
  const research = process.env.AGENT_DELEGATE_PROFILE === "research";
  // Scope roots: the JSON list takes precedence; the single-root env var is
  // the equivalent one-element form. Relative child paths resolve against
  // the first root; other roots are addressed absolutely.
  const rootsRaw = process.env.AGENT_DELEGATE_SCOPE_ROOTS;
  const roots: string[] = rootsRaw
    ? (JSON.parse(rootsRaw) as string[])
    : process.env.AGENT_DELEGATE_SCOPE_ROOT
      ? [process.env.AGENT_DELEGATE_SCOPE_ROOT]
      : [];
  if (!Array.isArray(roots) || roots.some((entry) => typeof entry !== "string" || !entry)) {
    throw new Error("AGENT_DELEGATE_SCOPE_ROOTS must be a JSON array of directory paths");
  }
  const root = roots[0];
  if (!root && !research) throw new Error("a delegated scope root is required (AGENT_DELEGATE_SCOPE_ROOTS)");
  // Writer children: the parent-created worktree the write tools are jailed
  // to. Always the first scope root, set only for writable agent children.
  const writeRoot = process.env.AGENT_DELEGATE_WRITE_ROOT;
  if (writeRoot && writeRoot !== root) throw new Error("AGENT_DELEGATE_WRITE_ROOT must be the first delegated scope root");

  const turnCap = resolveTurnCap(process.env.AGENT_DELEGATE_TURN_CAP);

  // Registration matrix by env: prose → inspect only; research scopeless →
  // web only; research + scope → web + inspect. The allowlist below matches
  // the registered set exactly.
  const allowedTools = new Set<string>();
  if (root) for (const name of INSPECT_TOOLS) allowedTools.add(name);
  if (research) for (const name of WEB_TOOLS) allowedTools.add(name);
  if (writeRoot) for (const name of WRITE_TOOLS) allowedTools.add(name);

  const detector = new LoopDetector();
  let turnsSeen = 0;
  let pastTurnCap = false;
  let loopHalted: string | undefined;

  pi.on("turn_start", () => {
    turnsSeen += 1;
    if (turnsSeen > turnCap && !pastTurnCap) {
      pastTurnCap = true;
      emitMarker({ type: "turn_cap", detail: `turn ${turnsSeen} exceeds cap ${turnCap}` });
    }
  });

  pi.on("tool_call", (event) => {
    if (!allowedTools.has(event.toolName)) {
      return { block: true, reason: `Child tool ${event.toolName} is outside the delegated capability set` };
    }
    if (pastTurnCap) {
      return { block: true, reason: `Turn cap ${turnCap} reached. ${WRAP_UP_DIRECTIVE}` };
    }
    if (loopHalted) {
      return { block: true, reason: `Loop guard halt (${loopHalted}). ${WRAP_UP_DIRECTIVE}` };
    }
    const verdict = detector.observeCall(event.toolName, event.input);
    if (verdict.kind === "nudge") {
      return { block: true, reason: verdict.message };
    }
    if (verdict.kind === "halt") {
      loopHalted = verdict.reason;
      emitMarker({ type: "loop_halt", detail: verdict.reason });
      return { block: true, reason: `Loop guard halt (${verdict.reason}). ${WRAP_UP_DIRECTIVE}` };
    }
  });

  pi.on("tool_result", (event) => {
    detector.observeResult(event.toolName, event.input, event.isError === true, eventResultText(event.content));
    if (allowedTools.has(event.toolName)) {
      const entry = provenanceFromToolResult({
        toolName: event.toolName,
        input: event.input,
        content: event.content,
        details: event.details as Record<string, unknown> | undefined,
        isError: event.isError,
      });
      emitMarker({ type: "provenance", detail: JSON.stringify(entry) });
    }
  });

  if (research) {
    let providerConfig: WebProviderConfig | undefined;
    const config = (): WebProviderConfig => (providerConfig ??= loadWebProviderConfig());

    pi.registerTool({
      name: "web_search",
      label: "Web Search",
      description:
        "Search the web over the configured provider chain. Reports the provider used; results carry title, url, and snippet.",
      promptSnippet: "Search the web with bounded results",
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: QUERY_MAX_CHARS, description: "Search query" }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: SEARCH_LIMIT_MAX, description: "Max results, default 10" })),
      }),
      async execute(_id, params) {
        const outcome = await webSearch(config(), params.query, params.limit ?? SEARCH_LIMIT_MAX);
        emitMarker({ type: "search_provider", detail: outcome.provider });
        const lines = outcome.results.map(
          (result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`,
        );
        return {
          content: [{ type: "text" as const, text: lines.join("\n") || "(no results)" }],
          details: { provider: outcome.provider, results: outcome.results.length },
        };
      },
    });

    pi.registerTool({
      name: "web_fetch",
      label: "Web Fetch",
      description:
        "Fetch one http(s) URL as text: max 5 redirects, 30 s timeout, 4 MiB raw / 64 KiB text caps, HTML reduced to text, injection findings annotated.",
      promptSnippet: "Fetch one URL as bounded text",
      parameters: Type.Object({
        url: Type.String({ minLength: 1, maxLength: 2000, description: "http or https URL" }),
      }),
      async execute(_id, params) {
        const result = await webFetch(params.url);
        return {
          content: [
            {
              type: "text" as const,
              text: `HTTP ${result.status} ${result.finalUrl}\n\n${annotate(result.text, result.findings, result.finalUrl)}`,
            },
          ],
          details: {
            status: result.status,
            finalUrl: result.finalUrl,
            truncated: result.truncated,
            scanFindings: result.findings,
          },
        };
      },
    });
  }

  if (writeRoot) {
    pi.registerTool({
      name: "write_file",
      label: "Write File",
      description: "Create or overwrite one UTF-8 text file inside the delegated worktree; parent directories are created. Jail escapes, symlinked paths, and secret-bearing names are refused.",
      promptSnippet: "Write one file inside the delegated worktree",
      parameters: Type.Object({
        path: Type.String({ minLength: 1, maxLength: 1000, description: "Path relative to the delegated worktree" }),
        content: Type.String({ description: "Complete file content" }),
      }),
      async execute(_id, params) {
        const outcome = await writeFile(writeRoot, params.path, params.content);
        return { content: [{ type: "text" as const, text: `wrote ${outcome.bytes} bytes to ${params.path}` }], details: outcome };
      },
    });

    pi.registerTool({
      name: "edit_file",
      label: "Edit File",
      description: "Replace exactly one unique occurrence of oldText with newText in a file inside the delegated worktree. Ambiguous or missing oldText fails without touching the file.",
      promptSnippet: "Edit one file inside the delegated worktree",
      parameters: Type.Object({
        path: Type.String({ minLength: 1, maxLength: 1000, description: "Path relative to the delegated worktree" }),
        oldText: Type.String({ minLength: 1, description: "Exact text to replace; must match exactly one location" }),
        newText: Type.String({ description: "Replacement text" }),
      }),
      async execute(_id, params) {
        await editFile(writeRoot, params.path, params.oldText, params.newText);
        return { content: [{ type: "text" as const, text: `replaced 1 occurrence in ${params.path}` }], details: { path: params.path } };
      },
    });

    pi.registerTool({
      name: "git_commit",
      label: "Git Commit",
      description: "Stage every change in the delegated worktree and commit it with a fixed argv; hooks and signing are disabled. Commit small and often with messages a reviewer can follow.",
      promptSnippet: "Commit the delegated worktree",
      parameters: Type.Object({
        message: Type.String({ minLength: 1, maxLength: 4000, description: "Commit message" }),
      }),
      async execute(_id, params) {
        const outcome = await gitCommit(writeRoot, params.message);
        return { content: [{ type: "text" as const, text: outcome.text }], details: { truncated: outcome.truncated } };
      },
    });
  }

  if (!root) return;

  pi.registerTool({
    name: "inspect_git_status",
    label: "Inspect Git Status",
    description: "Show bounded porcelain status for the scoped Git worktree using fixed argv and with hooks, pagers, submodules, and external helpers disabled.",
    promptSnippet: "Inspect scoped Git worktree status safely",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory selecting the scope to inspect; default the first delegated scope" })),
    }),
    async execute(_id, params, signal) {
      return toolResult(await inspectGitStatus(resolveGitDir(roots, (params as { path?: string }).path), signal));
    },
  });

  pi.registerTool({
    name: "inspect_git_diff",
    label: "Inspect Git Diff",
    description: "Show the bounded unstaged or staged diff for the scoped Git worktree using fixed argv and with hooks, pagers, textconv, submodules, and external diff drivers disabled.",
    promptSnippet: "Inspect a scoped Git diff safely",
    parameters: Type.Object({
      staged: Type.Optional(Type.Boolean({ description: "Read the staged index diff instead of unstaged worktree changes" })),
      path: Type.Optional(Type.String({ description: "Directory selecting the scope to inspect; default the first delegated scope" })),
    }),
    async execute(_id, params, signal) {
      return toolResult(await inspectGitDiff(resolveGitDir(roots, (params as { path?: string }).path), params.staged, signal));
    },
  });

  pi.registerTool({
    name: "inspect_read",
    label: "Inspect Read",
    description: "Read a text file inside the delegated scope with line numbers. Symlinks, secret-bearing paths, binary files, and files over 2 MiB are refused.",
    promptSnippet: "Read scoped text files with line numbers",
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to the first delegated scope, or an absolute path inside any delegated scope" }),
      offset: Type.Optional(Type.Integer({ minimum: 1 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000 })),
    }),
    async execute(_id, params) {
      const target = dispatchAcrossScopes(roots, params.path);
      const result = await inspectRead(target.root, target.path, params.offset, params.limit);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "inspect_ls",
    label: "Inspect List",
    description: "List non-secret, non-symlink entries in one directory inside the delegated scope.",
    promptSnippet: "List entries inside the delegated scope",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory relative to the first scope or absolute inside any scope; default ." })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    }),
    async execute(_id, params) {
      const target = dispatchAcrossScopes(roots, params.path);
      const result = await inspectLs(target.root, target.path, params.limit);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "inspect_find",
    label: "Inspect Find",
    description: "Find non-secret regular files inside the delegated scope using *, **, and ? wildcards. Symlinks are skipped and traversal is capped.",
    promptSnippet: "Find files inside the delegated scope",
    parameters: Type.Object({
      pattern: Type.String({ minLength: 1, maxLength: 500, description: "Wildcard pattern such as **/*.ts" }),
      path: Type.Optional(Type.String({ description: "Starting directory relative to the first scope or absolute inside any scope; default ." })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000 })),
    }),
    async execute(_id, params) {
      const target = dispatchAcrossScopes(roots, params.path);
      const result = await inspectFind(target.root, params.pattern, target.path, params.limit);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "inspect_grep",
    label: "Inspect Grep",
    description: "Search literal text across authorized text files inside the delegated scope. Every traversed file is checked; symlinks, secrets, binary/large files are skipped.",
    promptSnippet: "Search text inside authorized scoped files",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 1000, description: "Literal text to search for" }),
      path: Type.Optional(Type.String({ description: "File or directory relative to the first scope or absolute inside any scope; default ." })),
      glob: Type.Optional(Type.String({ description: "Optional file wildcard such as **/*.ts" })),
      caseSensitive: Type.Optional(Type.Boolean()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    }),
    async execute(_id, params) {
      const target = dispatchAcrossScopes(roots, params.path);
      const result = await inspectGrep(target.root, params.query, target.path, params.glob, params.caseSensitive, params.limit);
      return toolResult(result);
    },
  });
}
