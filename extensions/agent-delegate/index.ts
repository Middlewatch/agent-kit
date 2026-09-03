import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { resolveScope } from "./src/scope.ts";
import { assertReturnSchema, extractJson, validateReturn } from "./src/schema.ts";
import { formatDelegatedTask, formatTypedTask, parseMarkers, truncateUtf8, type ChildMarker } from "./src/protocol.ts";
import { MAX_PROVENANCE_BYTES, MAX_PROVENANCE_ENTRIES, unmatchedCitations, type EvidenceReference, type ProvenanceEntry } from "./src/provenance.ts";
import { type ManagedChild, processTreeExists, stopProcessTree, waitForProcessTreeExit } from "./src/process.ts";
import { DELEGATE_PROFILE_NAMES, POOL_LIMITS, type DelegatePoolName, type DelegateProfile, type DelegateProfileName, resolveDelegateProfile } from "./src/profile.ts";
import { THINKING_LEVELS, TIER_NAMES, type ResolvedRoute, type TierName, loadTiers, resolveRoute } from "./src/tiers.ts";
import { loadAgentDefinitions, type AgentDefinition } from "./src/agents.ts";
import { createWorktree, removeWorktree, summarizeWorktree, type CreatedWorktree } from "./src/worktree.ts";
import { PARTIAL_OUTPUT_CAP_BYTES, pruneRecords, writeAssessment, writeRecord, type DelegateStatus, type DelegationRecord, type Usage } from "./src/record.ts";
import { annotate, sanitize, scan, type ScanFinding } from "./src/scan.ts";
import type { SearchProviderName } from "./src/web.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // one-hour wall-clock on every profile
const MAX_RESULT_BYTES = 24 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const MAX_EVENT_LINE_BYTES = 4 * 1024 * 1024;
const RECENT_LIMIT = 12;
const TURN_BACKSTOP_SLACK = 5; // parent terminates at turnCap + 5 assistant messages
const DETAILS_SCHEMA = "agent-delegate-result-v1";
const LEGACY_DETAILS_SCHEMAS = ["sol-delegate-result-v1", "sol-delegate-result-v2", "sol-delegate-result-v3"] as const;
const CHILD_SYSTEM_PROMPT = readFileSync(resolve(ROOT, "child-contract.md"), "utf8");
// Spend policy: the versioned tier table beside the extension owns every
// model slug; a malformed table fails the extension at load, never per call.
const TIERS = loadTiers(resolve(ROOT, "tiers.json"));

// Agent definitions are versioned files beside the extension; the root
// invokes them by name and can never define or modify one per call. The env
// override is a test seam mirroring AGENT_DELEGATE_RECORDS_DIR.
function agentsDir(): string {
  return process.env.AGENT_DELEGATE_AGENTS_DIR ?? resolve(ROOT, "agents");
}
let agentCache: { dir: string; agents: Map<string, AgentDefinition> } | undefined;
function agentTable(): Map<string, AgentDefinition> {
  const dir = agentsDir();
  if (agentCache?.dir !== dir) agentCache = { dir, agents: loadAgentDefinitions(dir) };
  return agentCache.agents;
}
// Mirrors MARKER_PREFIX in src/protocol.ts: used only to keep structured marker
// lines out of human-facing failure diagnostics.
const STDERR_MARKER_PREFIX = "AGENT_DELEGATE_EVENT ";
const MAX_MARKER_LINE_BYTES = 64 * 1024; // a line longer than this cannot be a marker
const SEARCH_PROVIDER_NAMES: ReadonlySet<string> = new Set(["serper", "brave", "tavily"]);

/** Record store: production default under the XDG state dir; the suite overrides it via env. */
function recordsDir(): string {
  return process.env.AGENT_DELEGATE_RECORDS_DIR ?? join(homedir(), ".local", "state", "agent-delegate", "records");
}

/** Writer worktrees: production default under the XDG state dir; the suite overrides it via env. */
function worktreesDir(): string {
  return process.env.AGENT_DELEGATE_WORKTREES_DIR ?? join(homedir(), ".local", "state", "agent-delegate", "worktrees");
}

type TypedValidation =
  | { kind: "ok"; payload: string }
  | { kind: "invalid"; errors: string[] }
  | { kind: "oversize"; bytes: number };

/** Extract → validate → oversize-check for one candidate typed-return text. */
function validateTypedText(schema: object, cleaned: string, maxPayloadBytes = MAX_RESULT_BYTES): TypedValidation {
  const value = extractJson(cleaned);
  if (value === undefined) return { kind: "invalid", errors: ["no JSON object found in child output"] };
  const verdict = validateReturn(schema, value);
  if (!verdict.ok) return { kind: "invalid", errors: verdict.errors };
  const pretty = JSON.stringify(value, null, 2);
  const bytes = Buffer.byteLength(pretty, "utf8");
  if (bytes > maxPayloadBytes) return { kind: "oversize", bytes };
  return { kind: "ok", payload: pretty };
}

interface WriterSummaryDetails {
  branch: string;
  worktreePath: string;
  repoRoot: string;
  baseCommit: string;
  commits: string[];
  diffstat: string;
  dirty: boolean;
  removed: boolean;
  error?: string;
}

interface DelegateDetails {
  schema: typeof DETAILS_SCHEMA | (typeof LEGACY_DETAILS_SCHEMAS)[number];
  id: string;
  label: string;
  taskPreview: string;
  scope: string;
  status: DelegateStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  pid?: number;
  currentActivity?: string;
  tools: string[];
  usage: Usage;
  model: string;
  profile?: DelegateProfileName;
  tier?: TierName;
  thinking?: string;
  agent?: string;
  writer?: WriterSummaryDetails;
  stopReason?: string;
  exitCode?: number;
  truncated?: boolean;
  diagnostic?: string;
  validation?: { outcome: "valid" | "failed"; errors?: string[] };
  loop?: { kind: "cycle" | "error-streak"; detail: string };
  scanFindings?: ScanFinding[];
  searchProviders?: SearchProviderName[];
  partialOutput?: string;
  provenance?: ProvenanceEntry[];
  provenanceCount?: number;
  unmatchedCitations?: EvidenceReference[];
}

interface ActiveDelegate extends ManagedChild {
  details: DelegateDetails;
  profile: DelegateProfile;
  pool: DelegatePoolName;
  timeout?: NodeJS.Timeout;
  shutdownCause?: string;
  /** The shutdown handler's authoritative terminal classification, recorded or pending. */
  shutdownTerminal?: { status: DelegateStatus; diagnostic: string };
  recorded?: boolean;
  recordTerminal?: () => void;
}

const active = new Map<string, ActiveDelegate>();
// Pool slots reserved synchronously between the capacity check and the
// child's registration in `active`, covering the async worktree-creation gap
// so concurrent writer calls cannot all observe an empty pool.
const poolReservations: Record<DelegatePoolName, number> = { prose: 0, typed: 0, writer: 0 };
const recent: DelegateDetails[] = [];
let currentUiContext: any;

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0, contextTokens: 0 };
}

function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

function trimUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  return truncateUtf8(value, maxBytes, "\n\n[delegate output truncated]");
}

function appendRollingTranscript(current: string, next: string): string {
  const combined = current ? `${current}\n\n${next}` : next;
  const encoded = Buffer.from(combined, "utf8");
  if (encoded.length <= PARTIAL_OUTPUT_CAP_BYTES) return combined;
  const prefix = "[earlier assistant output omitted]\n";
  let start = encoded.length - PARTIAL_OUTPUT_CAP_BYTES + Buffer.byteLength(prefix, "utf8");
  while (start < encoded.length && (encoded[start] & 0xc0) === 0x80) start += 1;
  return prefix + encoded.subarray(start).toString("utf8");
}

function provenanceFromMarkers(markers: ChildMarker[]): ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [];
  let bytes = 2;
  for (const marker of markers) {
    if (marker.type !== "provenance" || entries.length >= MAX_PROVENANCE_ENTRIES) continue;
    try {
      const parsed = JSON.parse(marker.detail) as ProvenanceEntry;
      if (
        typeof parsed?.tool === "string" && typeof parsed.target === "string" &&
        (parsed.status === "ok" || parsed.status === "error") && typeof parsed.sha256 === "string" &&
        Array.isArray(parsed.references)
      ) {
        const entryBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8") + 1;
        if (bytes + entryBytes > MAX_PROVENANCE_BYTES) break;
        entries.push(parsed);
        bytes += entryBytes;
      }
    } catch { /* malformed provenance markers contribute no evidence */ }
  }
  return entries;
}

function compactDetails(details: DelegateDetails): DelegateDetails {
  return {
    ...details,
    taskPreview: details.taskPreview.slice(0, 500),
    tools: [...new Set(details.tools)].slice(0, 40),
    diagnostic: details.diagnostic?.slice(0, 1000),
    provenance: undefined,
    provenanceCount: details.provenance?.length,
    currentActivity: undefined,
  };
}

function updateUi(ctx = currentUiContext): void {
  if (!ctx) return;
  currentUiContext = ctx;
  const rows = [...active.values()].map((entry) => entry.details);
  if (rows.length === 0) {
    ctx.ui.setStatus("agent-delegate", undefined);
    ctx.ui.setWidget("agent-delegate", undefined);
    return;
  }
  const pools: Record<DelegatePoolName, number> = { prose: 0, typed: 0, writer: 0 };
  for (const entry of active.values()) pools[entry.pool] += 1;
  ctx.ui.setStatus("agent-delegate", `prose ${pools.prose}/${POOL_LIMITS.prose} · typed ${pools.typed}/${POOL_LIMITS.typed} · writer ${pools.writer}/${POOL_LIMITS.writer}`);
  ctx.ui.setWidget(
    "agent-delegate",
    (_tui: unknown, theme: any) => new Text(rows.map((row) => {
      const activity = row.currentActivity ? ` — ${row.currentActivity}` : "";
      return `${theme.fg("warning", "●")} ${theme.fg("accent", row.label)}${theme.fg("dim", activity)}`;
    }).join("\n"), 0, 0),
    { placement: "belowEditor" },
  );
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  // Test seam: AGENT_DELEGATE_CHILD_CMD substitutes the child invocation
  // (whitespace-split command prefix; the normal child arguments follow it).
  // Honoured by every delegated child spawn.
  const override = process.env.AGENT_DELEGATE_CHILD_CMD?.trim();
  if (override) {
    const [command, ...prefix] = override.split(/\s+/);
    return { command, args: [...prefix, ...args] };
  }
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const executable = process.execPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!/^(node|bun)(\.exe)?$/.test(executable)) return { command: process.execPath, args };
  return { command: "pi", args };
}

function childTools(profile: DelegateProfile, scoped: boolean, subset?: string[], writable = false): string {
  const tools: string[] = [];
  if (scoped) tools.push("inspect_read", "inspect_grep", "inspect_find", "inspect_ls", "inspect_git_status", "inspect_git_diff");
  if (profile.webTools) tools.push("web_search", "web_fetch");
  if (writable) tools.push("write_file", "edit_file", "git_commit");
  const granted = subset ? tools.filter((tool) => subset.includes(tool)) : tools;
  return granted.join(",");
}

function childArgs(
  task: string,
  route: ResolvedRoute,
  toolsCsv: string,
  resultSchema?: object,
  definition?: AgentDefinition,
): string[] {
  const framedTask = resultSchema ? formatTypedTask(task, resultSchema) : task;
  const systemPrompt = definition ? `${CHILD_SYSTEM_PROMPT}\n\n## Role\n\n${definition.rolePrompt}` : CHILD_SYSTEM_PROMPT;
  return [
    "--mode", "json", "--print", "--no-session", "--no-builtin-tools", "--no-approve",
    "--no-extensions", "--extension", resolve(ROOT, "child-scope.ts"),
    "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes",
    "--model", route.model, "--thinking", route.thinking,
    "--system-prompt", systemPrompt,
    "--tools", toolsCsv,
    formatDelegatedTask(framedTask),
  ];
}

function parseAssistantMessage(message: any, details: DelegateDetails): string | undefined {
  details.usage.turns += 1;
  const usage = message.usage;
  if (usage) {
    details.usage.input += usage.input ?? 0;
    details.usage.output += usage.output ?? 0;
    details.usage.cacheRead += usage.cacheRead ?? 0;
    details.usage.cacheWrite += usage.cacheWrite ?? 0;
    details.usage.cost += usage.cost?.total ?? 0;
    details.usage.contextTokens = usage.totalTokens ?? details.usage.contextTokens;
  }
  if (typeof message.stopReason === "string") details.stopReason = message.stopReason.slice(0, 200);
  let text = "";
  for (const part of message.content ?? []) {
    if (part.type === "toolCall" && typeof part.name === "string") details.tools.push(part.name.slice(0, 100));
    if (part.type === "text" && part.text?.trim()) text += `${part.text}\n`;
  }
  return text.trim() || undefined;
}

function sessionRows(ctx: any): DelegateDetails[] {
  const rows = new Map<string, DelegateDetails>();
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message?.role !== "toolResult" || entry.message.toolName !== "delegate") continue;
    const details = entry.message.details as DelegateDetails | undefined;
    if (details?.schema === DETAILS_SCHEMA || (LEGACY_DETAILS_SCHEMAS as readonly string[]).includes(details?.schema ?? "")) rows.set(details.id, details);
  }
  for (const row of recent) rows.set(row.id, row);
  for (const row of active.values()) rows.set(row.details.id, row.details);
  return [...rows.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, RECENT_LIMIT);
}

export default function agentDelegate(pi: ExtensionAPI): void {
  if (process.platform === "win32") throw new Error("agent-delegate currently requires a POSIX host for process-tree cleanup");
  agentTable(); // fail closed at extension load on a broken agents directory
  pi.on("session_start", (_event, ctx) => {
    currentUiContext = ctx;
    try {
      pruneRecords(recordsDir(), new Date());
    } catch { /* record pruning is best-effort housekeeping */ }
    updateUi(ctx);
  });
  pi.on("session_shutdown", async () => {
    const rows = [...active.values()];
    for (const entry of rows) {
      if (entry.timeout) clearTimeout(entry.timeout);
      entry.shutdownCause = "session shutdown";
    }
    const stopWithRetries = async (entry: ManagedChild) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await stopProcessTree(entry);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolveRetry) => setTimeout(resolveRetry, 1000));
        }
      }
      throw lastError;
    };
    const outcomes = await Promise.allSettled(rows.map(stopWithRetries));
    for (const entry of rows) {
      // A row already terminally classified and recorded (a survivor from a
      // prior sweep) keeps its sealed accountability: the stop retry above
      // still applies, but its classification is never rewritten.
      if (entry.recorded) continue;
      // Shutdown is a terminal path even when cleanup fails: a surviving tree
      // is classified and recorded as a cleanup failure, never silently
      // skipped. The once-only guard in recordTerminal keeps the execute()
      // continuation from writing a duplicate if it resumes afterwards.
      const survived = processTreeExists(entry);
      entry.details.status = survived ? "failed" : "cancelled";
      entry.details.diagnostic = survived
        ? "session shutdown: process-tree cleanup failed; tree survived TERM/KILL"
        : entry.shutdownCause;
      entry.shutdownTerminal = { status: entry.details.status, diagnostic: entry.details.diagnostic ?? "session shutdown" };
      entry.details.endedAt ??= new Date().toISOString();
      entry.details.durationMs ??= Date.now() - Date.parse(entry.details.startedAt);
      entry.recordTerminal?.();
      if (!survived) active.delete(entry.details.id);
    }
    updateUi();
    const failures = outcomes.filter((outcome) => outcome.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) throw new Error(`failed to terminate ${failures.length} delegated child process(es): ${failures.map((failure) => String(failure.reason)).join("; ")}`);
  });

  pi.registerCommand("delegations", {
    description: "Inspect active and recent bounded delegations",
    handler: async (_args, ctx) => {
      const rows = sessionRows(ctx);
      if (rows.length === 0) return ctx.ui.notify("No delegations in this session", "info");
      if (ctx.mode !== "tui") return ctx.ui.notify(`${rows.length} delegation record(s)`, "info");
      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const text = rows.map((row) => {
          const icon = row.status === "completed" ? "✓" : row.status === "running" || row.status === "starting" ? "●" : "✗";
          const usage = `↑${formatTokens(row.usage.input)} ↓${formatTokens(row.usage.output)}`;
          return `${icon} ${row.label} [${row.status}] ${usage}\n  ${row.scope}\n  ${row.taskPreview}`;
        }).join("\n\n");
        return {
          render: (width: number) => text.split("\n").map((line) => truncateToWidth(line, width)),
          invalidate() {},
          handleInput: () => done(undefined),
        };
      });
    },
  });

  pi.registerTool({
    name: "assess_delegation",
    label: "Assess Delegation",
    description: "Record whether a completed delegation was used, corrected, or discarded so delegation quality can be measured independently of process success.",
    promptSnippet: "Record a delegated response",
    promptGuidelines: ["Use assess_delegation after consuming a delegated result when its disposition is clear."],
    parameters: Type.Object({
      delegationId: Type.String({ minLength: 1, maxLength: 100, description: "The id shown in the delegate result's final model-visible text block" }),
      disposition: StringEnum(["used", "corrected", "discarded"] as const),
      reason: Type.String({ minLength: 1, maxLength: 1000, description: "Why the result was useful, needed correction, or was discarded" }),
    }),
    async execute(_toolCallId, params) {
      const assessment = writeAssessment(recordsDir(), params.delegationId, params.disposition, params.reason);
      return {
        content: [{ type: "text", text: `Recorded ${assessment.disposition} assessment for delegation ${assessment.delegationId}.` }],
        details: assessment,
      };
    },
  });

  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: [
      // The "when" lives in promptGuidelines (rendered into the core) so the
      // model reads one threshold, not two. Pool sizes, tier routing, and
      // worktree mechanics live in README.md; the description carries only
      // what a call needs.
      "Launch one depth-one child with fresh context for bounded independent evidence gathering.",
      "Profiles: explore (default) for read-heavy discovery and tracing, review for adversarial critique, research for web-backed answers returning one JSON object validated against resultSchema. Explore and review may also request a schema-validated return.",
      "Optional tier (scout, analyst, judge) and thinking (low, medium, high) escalate the profile's default routing when the task warrants it.",
      "The child has four bounded file inspection tools and shell-free git status/diff; no AGENTS.md, built-in tools, edits, memory, delegation, or network outside research's web tools. Writable agents (seeded: editor) edit in their own git worktree and return the branch and diffstat for the root to review and merge.",
      "Returned URL and path:line citations are checked against the child's provenance ledger; unmatched ones surface in details, and requireMatchedCitations fails the call on any.",
      "Give a complete brief with one question, exact scope, expected evidence, exclusions, and a concise return format. The root verifies claims and owns the final answer.",
      "scope is an existing directory beneath the home directory (or beneath Pi's cwd when Pi runs outside home); Pi refuses home itself, filesystem root, and runtime or credential trees such as ~/.config and ~/.ssh. Calls emitted together run concurrently.",
    ].join(" "),
    promptSnippet: "Run a fresh-context exploration or review",
    promptGuidelines: [
      "Use delegate only when independent breadth or a genuinely fresh or adversarial context repays the coordination cost; never for ordered judgment or shared writes",
      "Omit delegate's profile or use explore for repository discovery and tracing",
    ],
    parameters: Type.Object({
      profile: Type.Optional(StringEnum(DELEGATE_PROFILE_NAMES, {
        description: "Child capability profile: explore (default), review, or research (web-capable, schema-validated JSON return)",
        default: "explore",
      })),
      agent: Type.Optional(Type.String({
        minLength: 1,
        maxLength: 64,
        description: "Named agent definition supplying a role prompt and defaults on top of its base profile (seeded: explorer, critic, researcher, refuter, comment-sicko, editor). Mutually exclusive with profile; tier and thinking params still apply.",
      })),
      tier: Type.Optional(StringEnum(TIER_NAMES, {
        description: "Model tier override when the profile default is insufficient: scout (fast, cheap), analyst (strong), judge (strong, deepest reasoning). Defaults: explore scout; review and research analyst.",
      })),
      thinking: Type.Optional(StringEnum(THINKING_LEVELS, {
        description: "Reasoning-level override applied to the resolved tier's model; defaults to the tier's own level",
      })),
      label: Type.String({ minLength: 1, maxLength: 48, description: "Short workstream label shown in the TUI" }),
      scope: Type.Optional(Type.String({ minLength: 1, maxLength: 1000, description: "Existing directory beneath the home directory or beneath Pi's current working directory; explore and review require scope or scopes, research may go scopeless" })),
      scopes: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), {
        minItems: 1,
        maxItems: 4,
        description: "Up to four scope directories under the same rules as scope; the child resolves relative paths against the first and addresses the others absolutely. Mutually exclusive with scope.",
      })),
      resultSchema: Type.Optional(Type.Object({}, {
        additionalProperties: true,
        description: "JSON Schema the child's single JSON object return must validate against; required with profile research and optional for explore/review. Stay within the documented keyword subset (type, properties, required, items, enum, const, minimum, maximum, minLength, maxLength, minItems, maxItems, description, additionalProperties) and under 8192 bytes serialized.",
      })),
      requireMatchedCitations: Type.Optional(Type.Boolean({ description: "Fail the delegation when the final answer cites a URL or path:line range absent from the child's successful tool-result provenance ledger" })),
      task: Type.String({ minLength: 80, maxLength: 12_000, description: "Complete bounded assignment with scope, evidence, exclusions, and concise output request" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (params.agent !== undefined && params.profile !== undefined) throw new Error("supply agent or profile, not both");
      const definition = params.agent === undefined ? undefined : agentTable().get(params.agent);
      if (params.agent !== undefined && definition === undefined) {
        const known = [...agentTable().keys()].join(", ") || "none";
        throw new Error(`unknown agent definition: ${params.agent} (available: ${known})`);
      }
      const baseProfile = resolveDelegateProfile(definition?.profile ?? params.profile);
      const profile = definition?.turnCap !== undefined ? { ...baseProfile, turnCap: definition.turnCap } : baseProfile;
      const route = resolveRoute(TIERS, definition?.tier ?? profile.tier, params.tier, params.thinking ?? definition?.thinking);
      if (profile.returnMode === "typed" && params.resultSchema === undefined) throw new Error(`profile ${profile.name} requires resultSchema`);
      if (params.resultSchema !== undefined) assertReturnSchema(params.resultSchema);
      const pool: DelegatePoolName = definition?.writable ? "writer" : profile.pool;
      const poolActive = [...active.values()].filter((entry) => entry.pool === pool).length + poolReservations[pool];
      if (poolActive >= POOL_LIMITS[pool]) {
        throw new Error(`delegate ${pool} pool limit reached (${POOL_LIMITS[pool]}); wait for active children`);
      }
      if (params.scope !== undefined && params.scopes !== undefined) throw new Error("supply scope or scopes, not both");
      const requestedScopes = params.scopes ?? (params.scope !== undefined ? [params.scope] : undefined);
      if (requestedScopes !== undefined && (requestedScopes.length < 1 || requestedScopes.length > 4)) {
        throw new Error("delegate accepts at most four scope directories");
      }
      const scopePaths: string[] = [];
      if (requestedScopes === undefined) {
        const scopeless = resolveScope(ctx.cwd, undefined, { required: profile.scopeRequired });
        if (!scopeless.allowed) throw new Error(`delegate scope denied: ${scopeless.reason ?? "invalid scope"}`);
      } else {
        for (const requested of requestedScopes) {
          const decision = resolveScope(ctx.cwd, requested);
          if (!decision.allowed || !decision.path) throw new Error(`delegate scope denied: ${decision.reason ?? "invalid scope"}`);
          if (!scopePaths.includes(decision.path)) scopePaths.push(decision.path);
        }
      }

      const id = randomUUID();
      const scoped = scopePaths.length > 0;
      const capabilitySet = childTools(profile, scoped, definition?.tools, definition?.writable === true).split(",").filter(Boolean);
      if (definition?.tools && capabilitySet.length === 0) {
        throw new Error(`agent ${definition.name}'s tool subset grants no tools under this profile and scope`);
      }
      const invocation = getPiInvocation(childArgs(params.task, route, capabilitySet.join(","), params.resultSchema, definition));
      // A NUL byte anywhere in the child argv makes Node's spawn throw
      // synchronously; reject it before reserving a pool slot so a stray
      // NUL in the task or schema cannot leak the reservation.
      if (invocation.args.some((arg) => arg.includes("\0"))) {
        throw new Error("delegate task or resultSchema contains a NUL byte the child process cannot receive");
      }
      // Writer children work in an extension-created worktree on branch
      // delegate/<id>, branched from the first scope's repository HEAD. The
      // worktree replaces the first scope so inspection, writes, and the
      // child's cwd all land there; later scopes stay read-only. The pool
      // slot is reserved across the await; everything from here to the
      // active registration is otherwise synchronous.
      poolReservations[pool] += 1;
      let worktree: CreatedWorktree | undefined;
      if (definition?.writable) {
        try {
          if (scopePaths.length === 0) throw new Error(`agent ${definition.name} is writable and requires a scope inside a git repository`);
          worktree = await createWorktree(scopePaths[0], id, worktreesDir());
          scopePaths[0] = worktree.path;
        } catch (error) {
          poolReservations[pool] -= 1;
          throw error;
        }
      }
      const assessmentReference = `Delegation ID for assess_delegation: ${id}`;
      // Reserve one separator byte between model-visible text blocks plus
      // space for the assessment reference so the complete visible result,
      // not only the child-authored payload, stays inside the return cap.
      const resultPayloadBudget = MAX_RESULT_BYTES - Buffer.byteLength(`\n${assessmentReference}`, "utf8");
      const started = Date.now();
      const details: DelegateDetails = {
        schema: DETAILS_SCHEMA,
        id,
        label: params.label.trim(),
        taskPreview: params.task.trim().replace(/\s+/g, " ").slice(0, 500),
        scope: scopePaths.length ? scopePaths.join(" + ") : "(scopeless)",
        status: "starting",
        startedAt: new Date(started).toISOString(),
        tools: [],
        usage: emptyUsage(),
        model: route.model,
        profile: profile.name,
        tier: route.tier,
        thinking: route.thinking,
        agent: definition?.name,
      };
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PI_SKIP_VERSION_CHECK: "1",
        PI_TELEMETRY: "0",
        AUTOJOURNAL_AMBIENT: "off",
        AUTOJOURNAL_MISS_LOG: "off",
        AGENT_DELEGATE_PROFILE: profile.name,
      };
      if (worktree) childEnv.AGENT_DELEGATE_WRITE_ROOT = worktree.path;
      else delete childEnv.AGENT_DELEGATE_WRITE_ROOT;
      if (scoped) {
        childEnv.AGENT_DELEGATE_SCOPE_ROOT = scopePaths[0];
        childEnv.AGENT_DELEGATE_SCOPE_ROOTS = JSON.stringify(scopePaths);
      } else {
        delete childEnv.AGENT_DELEGATE_SCOPE_ROOT;
        delete childEnv.AGENT_DELEGATE_SCOPE_ROOTS;
      }
      // Turn cap: an inherited AGENT_DELEGATE_TURN_CAP from the parent's own
      // environment passes through clamped to [1, 100]; otherwise the child
      // gets the resolved profile cap. Production runs never set it — the
      // override is a test seam that drives the cap low on purpose.
      const inheritedTurnCap = Number.parseInt(process.env.AGENT_DELEGATE_TURN_CAP ?? "", 10);
      childEnv.AGENT_DELEGATE_TURN_CAP = String(Number.isNaN(inheritedTurnCap) ? profile.turnCap : Math.min(100, Math.max(1, inheritedTurnCap)));
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(invocation.command, invocation.args, {
          cwd: scopePaths[0] ?? ctx.cwd,
          detached: process.platform !== "win32",
          env: childEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        // A synchronous spawn failure lands after the pool reservation and,
        // for writers, after worktree creation; roll both back so the slot
        // and branch do not leak.
        poolReservations[pool] -= 1;
        if (worktree) await removeWorktree(worktree.repoRoot, worktree.path, worktree.branch).catch(() => {});
        throw error;
      }
      details.pid = child.pid;
      details.status = "running";
      let timedOut = false;
      let hardTurnStop: string | undefined;
      const configuredTimeout = Number(process.env.AGENT_DELEGATE_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? Math.min(60 * 60 * 1000, Math.max(1000, configuredTimeout))
        : DEFAULT_TIMEOUT_MS;
      let resolveClosed!: (code: number) => void;
      const closed = new Promise<number>((resolveCode) => { resolveClosed = resolveCode; });
      const activeEntry: ActiveDelegate = { details, child, closed, exited: false, profile, pool };
      let rejectStopFailure!: (error: unknown) => void;
      const stopFailure = new Promise<number>((_resolve, reject) => { rejectStopFailure = reject; });
      let requestedStop: Promise<void> | undefined;
      const requestStop = () => {
        if (!requestedStop) {
          requestedStop = stopProcessTree(activeEntry);
          void requestedStop.catch(rejectStopFailure);
        }
        return requestedStop;
      };
      child.once("error", () => {
        if (!activeEntry.exited) { activeEntry.exited = true; resolveClosed(1); }
      });
      child.once("close", (code) => {
        if (!activeEntry.exited) { activeEntry.exited = true; resolveClosed(code ?? 1); }
      });
      const timeout = setTimeout(() => {
        if (!processTreeExists(activeEntry)) return;
        timedOut = true;
        details.status = "timed_out";
        details.currentActivity = "terminating after timeout…";
        updateUi(ctx);
        requestStop();
      }, timeoutMs);
      timeout.unref();
      activeEntry.timeout = timeout;
      active.set(id, activeEntry);
      poolReservations[pool] -= 1;
      updateUi(ctx);

      let stdoutBuffer = "";
      let stderr = "";
      let stderrCarry = "";
      // Marker lines are intercepted incrementally as stderr arrives, so a
      // marker past the 16 KiB diagnostic cap still classifies the child.
      const markersSeen: ChildMarker[] = [];
      let provenanceMarkersSeen = 0;
      const captureMarkers = (markers: ChildMarker[]) => {
        for (const marker of markers) {
          if (marker.type === "provenance") {
            if (provenanceMarkersSeen >= MAX_PROVENANCE_ENTRIES) continue;
            provenanceMarkersSeen += 1;
          }
          markersSeen.push(marker);
        }
      };
      let finalText = "";
      let rollingTranscript = "";
      let terminalOutput: string | undefined;
      let aborted = false;
      let lastUpdate = 0;
      const emit = () => {
        if (Date.now() - lastUpdate < 100) return;
        lastUpdate = Date.now();
        onUpdate?.({
          content: [{ type: "text", text: `${details.label}: ${details.currentActivity ?? details.status}` }],
          details: compactDetails(details),
        });
        updateUi(ctx);
      };
      const processLine = (line: string) => {
        if (!line.trim() || Buffer.byteLength(line, "utf8") > MAX_EVENT_LINE_BYTES) return;
        if (!line.includes('"type":"message_end"') && !line.includes('"type":"tool_execution_start"')) return;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_end" && event.message?.role === "assistant") {
            const text = parseAssistantMessage(event.message as Message, details);
            if (text) {
              finalText = text;
              rollingTranscript = appendRollingTranscript(rollingTranscript, text);
            }
            if (hardTurnStop === undefined && details.usage.turns >= profile.turnCap + TURN_BACKSTOP_SLACK) {
              hardTurnStop =
                `hard turn backstop: ${details.usage.turns} assistant messages reached ` +
                `the ${profile.turnCap}-turn cap plus ${TURN_BACKSTOP_SLACK}-turn slack`;
              details.currentActivity = "terminating at the hard turn backstop…";
              requestStop();
            }
          }
          if (event.type === "tool_execution_start") details.currentActivity = `${event.toolName ?? "tool"}…`;
          emit();
        } catch { /* malformed child event is ignored */ }
      };
      child.stdout?.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
        if (Buffer.byteLength(stdoutBuffer, "utf8") > MAX_EVENT_LINE_BYTES) stdoutBuffer = "";
      });
      child.stderr?.on("data", (chunk) => {
        stderrCarry += chunk.toString();
        const lines = stderrCarry.split("\n");
        stderrCarry = lines.pop() ?? "";
        // The bound applies only to the unterminated residual, after complete
        // lines are consumed: a marker line straddling data events can never
        // be truncated before it is parsed.
        if (Buffer.byteLength(stderrCarry, "utf8") > MAX_MARKER_LINE_BYTES) stderrCarry = stderrCarry.slice(-MAX_MARKER_LINE_BYTES);
        for (const line of lines) {
          if (line.trim().startsWith(STDERR_MARKER_PREFIX)) {
            if (Buffer.byteLength(line, "utf8") <= MAX_MARKER_LINE_BYTES) captureMarkers(parseMarkers(line));
          } else if (Buffer.byteLength(stderr, "utf8") < MAX_STDERR_BYTES) {
            stderr = truncateUtf8(`${stderr}${line}\n`, MAX_STDERR_BYTES, "\n[stderr truncated]").text;
          }
        }
      });

      /** Flush any unterminated trailing stderr line at child close. */
      const flushStderrCarry = () => {
        const line = stderrCarry.trim();
        stderrCarry = "";
        if (!line) return;
        if (line.startsWith(STDERR_MARKER_PREFIX)) {
          if (Buffer.byteLength(line, "utf8") <= MAX_MARKER_LINE_BYTES) captureMarkers(parseMarkers(line));
        }
        else if (Buffer.byteLength(stderr, "utf8") < MAX_STDERR_BYTES) {
          stderr = truncateUtf8(`${stderr}${line}\n`, MAX_STDERR_BYTES, "\n[stderr truncated]").text;
        }
      };

      /** Child stderr with structured marker lines removed, for human-facing diagnostics. */
      const stderrText = () =>
        stderr.split("\n").filter((line) => !line.trim().startsWith(STDERR_MARKER_PREFIX)).join("\n").trim();

      /**
       * Every terminal path writes one DelegationRecord carrying the brief
       * verbatim, the resolved capability set, accounting, and the failure
       * cause and partial output on failure paths. A record-write failure is
       * noted in the diagnostic, never thrown over the child's own outcome.
       */
      const recordTerminal = () => {
        if (activeEntry.recorded) return; // once-only: shutdown and execute() can both reach this
        activeEntry.recorded = true;
        if (details.status !== "completed" && details.partialOutput === undefined) {
          const partialSource = sanitize(rollingTranscript || finalText || stderrText()).text;
          if (partialSource) details.partialOutput = truncateUtf8(partialSource, PARTIAL_OUTPUT_CAP_BYTES, "…").text;
        }
        const providers: SearchProviderName[] = [];
        for (const marker of markersSeen) {
          if (marker.type === "search_provider" && SEARCH_PROVIDER_NAMES.has(marker.detail) && !providers.includes(marker.detail as SearchProviderName)) {
            providers.push(marker.detail as SearchProviderName);
          }
        }
        details.searchProviders = providers.length ? providers : undefined;
        details.provenance = provenanceFromMarkers(markersSeen);
        const record: DelegationRecord = {
          kind: "delegation",
          id: details.id,
          label: details.label,
          startedAt: details.startedAt,
          endedAt: details.endedAt ?? new Date().toISOString(),
          durationMs: details.durationMs ?? Date.now() - started,
          profile: profile.name,
          agent: definition?.name,
          tier: route.tier,
          model: route.model,
          scope: scopePaths[0],
          scopes: scopePaths.length ? scopePaths : undefined,
          capabilitySet,
          brief: params.task,
          resultSchema: params.resultSchema,
          status: details.status,
          usage: { ...details.usage },
          failureCause: details.status === "completed" ? undefined : details.diagnostic,
          partialOutput: details.partialOutput,
          output: details.status === "completed" ? terminalOutput : undefined,
          validation: details.validation,
          loop: details.loop,
          searchProviders: details.searchProviders,
          writer: details.writer,
          scanFindings: details.scanFindings ?? [],
          provenance: details.provenance,
          unmatchedCitations: details.unmatchedCitations,
        };
        let writeError: unknown;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            writeRecord(recordsDir(), record);
            writeError = undefined;
            break;
          } catch (error) {
            writeError = error;
          }
        }
        if (writeError) {
          const message = `delegation record write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`;
          details.diagnostic = details.diagnostic ? `${details.diagnostic}; ${message}` : message;
        }
      };
      activeEntry.recordTerminal = recordTerminal;

      const onAbort = () => {
        if (!processTreeExists(activeEntry)) return;
        aborted = true;
        details.status = "cancelled";
        details.currentActivity = "cancelling…";
        emit();
        requestStop();
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });

      let exitCode: number;
      try {
        exitCode = await Promise.race([closed, stopFailure]);
        if (!requestedStop && processTreeExists(activeEntry)) requestStop();
        if (requestedStop) await requestedStop;
      } catch (error) {
        if (activeEntry.timeout) clearTimeout(activeEntry.timeout);
        signal?.removeEventListener("abort", onAbort);
        details.status = "failed";
        details.currentActivity = "process cleanup failed";
        details.diagnostic = error instanceof Error ? error.message : String(error);
        details.endedAt = new Date().toISOString();
        details.durationMs = Date.now() - started;
        recordTerminal();
        const published = compactDetails(details);
        recent.push(published);
        if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT);
        updateUi(ctx);
        void (async () => {
          while (active.get(id) === activeEntry) {
            try {
              if (await waitForProcessTreeExit(activeEntry, 60_000)) {
                if (active.get(id) === activeEntry) active.delete(id);
                updateUi(ctx);
                return;
              }
            } catch (pollError) {
              details.diagnostic = `cleanup monitoring failed: ${pollError instanceof Error ? pollError.message : String(pollError)}`;
              updateUi(ctx);
              await new Promise((resolveRetry) => setTimeout(resolveRetry, 1000));
            }
          }
        })();
        throw new Error(`[${details.label}] process cleanup failed: ${details.diagnostic}`);
      }
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      flushStderrCarry();

      // Wire markers parsed at close: loop_halt is a typed failure cause and
      // record field; search_provider accumulates into the record; turn_cap
      // explains a failure when the wrapped-up child could not deliver.
      const markers = markersSeen;
      const loopHalt = markers.find((marker) => marker.type === "loop_halt");
      const turnCapMarker = markers.find((marker) => marker.type === "turn_cap");
      details.provenance = provenanceFromMarkers(markers);

      details.exitCode = exitCode;
      details.endedAt = new Date().toISOString();
      details.durationMs = Date.now() - started;
      details.currentActivity = undefined;
      if (activeEntry.shutdownCause) details.status = "cancelled";
      else if (aborted) details.status = "cancelled";
      else if (timedOut) details.status = "timed_out";
      else if (!loopHalt && hardTurnStop === undefined && exitCode === 0 && finalText && details.stopReason !== "error" && details.stopReason !== "aborted") details.status = "completed";
      else details.status = "failed";

      if (loopHalt) {
        const detail = truncateUtf8(loopHalt.detail, 1000, "…").text;
        details.loop = { kind: /cycle/i.test(detail) ? "cycle" : "error-streak", detail };
      }
      if (details.status === "cancelled") details.diagnostic = activeEntry.shutdownCause ?? "cancelled by the root";
      else if (details.status === "timed_out") details.diagnostic = `exceeded ${timeoutMs}ms timeout`;
      else if (loopHalt) details.diagnostic = `loop halt: ${details.loop?.detail}${hardTurnStop ? `; ${hardTurnStop}` : ""}`;
      else if (hardTurnStop && details.status === "failed") details.diagnostic = hardTurnStop;
      else if (details.status === "failed") {
        details.diagnostic = stderrText().slice(0, 1000) || (exitCode !== 0 ? `exit ${exitCode}` : details.stopReason ?? "no final text");
      }
      if (details.status === "failed" && turnCapMarker && !loopHalt && hardTurnStop === undefined) {
        details.diagnostic = `${details.diagnostic} (child signalled its turn cap: ${turnCapMarker.detail.slice(0, 300)})`;
      }

      // Writer accountability: summarize the branch on every terminal path.
      // A worktree with commits or uncommitted changes always survives for
      // the root's review; an untouched one is removed with its branch.
      if (worktree) {
        const writer: WriterSummaryDetails = {
          branch: worktree.branch,
          worktreePath: worktree.path,
          repoRoot: worktree.repoRoot,
          baseCommit: worktree.baseCommit,
          commits: [],
          diffstat: "",
          dirty: false,
          removed: false,
        };
        try {
          const summary = await summarizeWorktree(worktree.path, worktree.baseCommit);
          writer.commits = summary.commits.slice(0, 100);
          writer.diffstat = summary.diffstat;
          writer.dirty = summary.dirty;
          if (summary.commits.length === 0 && !summary.dirty) {
            await removeWorktree(worktree.repoRoot, worktree.path, worktree.branch);
            writer.removed = true;
          }
        } catch (error) {
          writer.error = `worktree summary failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        details.writer = writer;
        if (details.status !== "completed" && !writer.removed) {
          details.diagnostic = `${details.diagnostic ?? "failed"}; writer worktree kept at ${writer.worktreePath} (branch ${writer.branch})`;
        }
      }

      // Writer children append a bounded branch report as its own
      // model-visible block: branch, commit list, diffstat, dirty state. It
      // is computed first so both typed and prose payload budgets account
      // for its bytes inside the complete model-visible result cap.
      let writerReport = "";
      if (details.writer) {
        const writer = details.writer;
        const lines = [
          `Writer branch: ${writer.branch}`,
          writer.removed
            ? "Worktree: removed (no commits, no changes)"
            : `Worktree: ${writer.worktreePath} — review, merge, then remove with: git -C ${writer.repoRoot} worktree remove ${writer.worktreePath} && git -C ${writer.repoRoot} branch -d ${writer.branch}`,
          `Commits:${writer.commits.length ? `\n${writer.commits.map((line) => `  ${line}`).join("\n")}` : " (none)"}`,
        ];
        if (writer.diffstat) lines.push(`Diffstat:\n${writer.diffstat}`);
        if (writer.dirty) lines.push("Uncommitted changes were left in the worktree.");
        if (writer.error) lines.push(writer.error);
        writerReport = trimUtf8(lines.join("\n"), 8 * 1024).text;
      }
      const contentBudget = writerReport ? resultPayloadBudget - Buffer.byteLength(`\n${writerReport}`, "utf8") : resultPayloadBudget;

      // Return boundary. Typed returns use deterministic extraction and fail
      // closed on invalid data; no second model is allowed to invent a repair.
      // Both modes audit citations against successful child tool results.
      let typedPayload: string | undefined;
      let contentText = "";
      let citationText = "";
      if (details.status === "completed" && params.resultSchema !== undefined) {
        const capped = trimUtf8(finalText, MAX_RESULT_BYTES);
        details.truncated = capped.truncated;
        const cleaned = sanitize(capped.text).text;
        citationText = cleaned;
        details.scanFindings = scan(cleaned);
        const outcome = validateTypedText(params.resultSchema as object, cleaned, contentBudget);
        if (outcome.kind === "ok") {
          details.validation = { outcome: "valid" };
          typedPayload = outcome.payload;
        } else {
          details.status = "failed";
          const errors = outcome.kind === "oversize"
            ? [`validated object serializes to ${outcome.bytes} bytes, leaving no room for the assessment id within the ${MAX_RESULT_BYTES}-byte result cap`]
            : outcome.errors;
          details.validation = { outcome: "failed", errors };
          details.diagnostic = outcome.kind === "oversize"
            ? `typed return oversize: validated object serializes to ${outcome.bytes} bytes; the complete result cap is ${MAX_RESULT_BYTES}`
            : `typed return failed schema validation: ${outcome.errors.join("; ")}`;
        }
      } else {
        const cleaned = sanitize(finalText || stderrText() || "(child produced no final text)").text;
        citationText = cleaned;
        details.scanFindings = scan(cleaned);
        const annotated = details.status === "completed"
          ? annotate(cleaned, details.scanFindings, `delegate child "${details.label}" (${profile.name})`)
          : cleaned;
        const trimmed = trimUtf8(annotated, MAX_RESULT_BYTES);
        details.truncated = trimmed.truncated;
        contentText = trimmed.text;
      }
      details.unmatchedCitations = unmatchedCitations(citationText, details.provenance ?? []);
      if (details.unmatchedCitations.length === 0) details.unmatchedCitations = undefined;
      if (details.status === "completed" && params.requireMatchedCitations && details.unmatchedCitations?.length) {
        details.status = "failed";
        details.diagnostic = `citation provenance check failed: ${details.unmatchedCitations.length} citation(s) were not present in successful child tool results`;
      }
      if (activeEntry.shutdownCause) {
        // Shutdown may land mid-pipeline; the
        // terminal classification always honours it. When the shutdown
        // handler already classified this entry (including a surviving-tree
        // cleanup failure), publish exactly what it recorded so the durable
        // record and the thrown result never diverge.
        details.status = activeEntry.shutdownTerminal?.status ?? "cancelled";
        details.diagnostic = activeEntry.shutdownTerminal?.diagnostic ?? activeEntry.shutdownCause;
      }
      if (typedPayload !== undefined) {
        terminalOutput = typedPayload;
      } else {
        const trimmed = trimUtf8(`[${details.label}] ${details.status}\n\n${contentText}`, contentBudget);
        terminalOutput = trimmed.text;
        if (trimmed.truncated) details.truncated = true;
      }
      recordTerminal();
      const published = compactDetails(details);
      active.delete(id);
      recent.push(published);
      if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT);
      updateUi(ctx);
      onUpdate?.({ content: [{ type: "text", text: `${details.label}: ${details.status}` }], details: published });
      if (details.status !== "completed") {
        const partial = details.partialOutput ? `\n\nPartial output (capped at ${PARTIAL_OUTPUT_CAP_BYTES} bytes):\n${details.partialOutput}` : "";
        throw new Error(`[${details.label}] ${details.status}: ${details.diagnostic ?? "unknown cause"}${partial}`);
      }
      return {
        content: [
          { type: "text", text: terminalOutput },
          ...(writerReport ? [{ type: "text" as const, text: writerReport }] : []),
          { type: "text", text: assessmentReference },
        ],
        details: published,
      };
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("delegate "))}${theme.fg("accent", args.label ?? "child")} ${theme.fg("muted", args.profile ?? "explore")} ${theme.fg("muted", args.scope ?? "")}` +
        `\n${theme.fg("dim", String(args.task ?? "").slice(0, 180))}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const row = result.details as DelegateDetails | undefined;
      if (!row) return new Text("delegate: no details", 0, 0);
      const icon = row.status === "completed" ? theme.fg("success", "✓")
        : row.status === "running" || row.status === "starting" ? theme.fg("warning", "●")
        : theme.fg("error", "✗");
      const route = row.thinking ? `${row.model} ${row.thinking}` : row.model;
      const usage = `${row.usage.turns} turns ↑${formatTokens(row.usage.input)} ↓${formatTokens(row.usage.output)} ${route}`;
      const header = `${icon} ${theme.fg("accent", row.label)} ${theme.fg("muted", row.status)}`;
      if (isPartial || !expanded) {
        const activity = row.currentActivity ? `\n${theme.fg("dim", row.currentActivity)}` : "";
        return new Text(`${header}${activity}\n${theme.fg("dim", usage)}`, 0, 0);
      }
      const box = new Container();
      box.addChild(new Text(header, 0, 0));
      box.addChild(new Spacer(1));
      box.addChild(new Text(theme.fg("muted", `Scope: ${row.scope}`), 0, 0));
      box.addChild(new Text(theme.fg("muted", "Task"), 0, 0));
      box.addChild(new Text(theme.fg("dim", String(context.args?.task ?? row.taskPreview)), 0, 0));
      if (row.tools.length) box.addChild(new Text(theme.fg("dim", `Tools: ${row.tools.join(", ")}`), 0, 0));
      const output = result.content.find((part) => part.type === "text");
      if (output?.type === "text") {
        box.addChild(new Spacer(1));
        box.addChild(new Markdown(output.text.replace(/^\[[^\]]+\] \w+\n\n/, ""), 0, 0, getMarkdownTheme()));
      }
      box.addChild(new Spacer(1));
      box.addChild(new Text(theme.fg("dim", `${row.durationMs ?? 0}ms · ${usage}`), 0, 0));
      return box;
    },
  });
}
