/**
 * Inspection: the immediate best-effort dump rendered from
 * ctx.getSystemPromptOptions() at command time, the one-shot armed capture
 * state, and the shared stamp/collision helpers for artifact filenames.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

/** Provider and model id for headers and filenames; `unknown` when absent. */
export function modelLabel(
  model: { provider: string; id: string } | undefined,
): { provider: string; modelId: string } {
  if (model === undefined) return { provider: "unknown", modelId: "unknown" };
  return { provider: model.provider, modelId: model.id };
}

/** Local time `YYYY-MM-DD-HHmmss`, zero-padded. */
export function makeStamp(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())}-` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

/**
 * Return `base`, or `${base}-${N}` for the smallest N >= 2, such that no
 * `join(dir, candidate + ext)` exists for any ext. Basename only; the caller
 * joins the directory and appends the extension.
 */
export function freeBase(dir: string, base: string, exts: string[]): string {
  const taken = (candidate: string) =>
    exts.some((ext) => fs.existsSync(path.join(dir, candidate + ext)));
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * A fence of backticks one longer than the longest backtick run inside
 * `content` (minimum three), so any prompt survives fencing.
 */
export function fenceFor(content: string): string {
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) {
    if (run.length > longest) longest = run.length;
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/** One `- item` line per entry, or `(none)` for an empty or absent list. */
function bullets(items: string[] | undefined): string {
  if (!items || items.length === 0) return "(none)\n";
  return items.map((item) => `- ${item}\n`).join("");
}

/** A verbatim block inside a fence, each line and block followed by one \n. */
export function fenced(content: string, info = ""): string {
  const fence = fenceFor(content);
  return `${fence}${info}\n${content}\n${fence}\n`;
}

/** The immediate dump: a best-effort rebuild from the command-time options. */
export function renderImmediateDump(options: BuildSystemPromptOptions): string {
  const tools = (options.selectedTools ?? []).map((tool) => {
    const snippet = options.toolSnippets?.[tool];
    return typeof snippet === "string" && snippet !== ""
      ? `${tool}: ${snippet}`
      : tool;
  });
  const contextFiles = (options.contextFiles ?? []).map(
    (file) => `${file.path} (${Buffer.byteLength(file.content, "utf8")} bytes)`,
  );
  const skills = (options.skills ?? []).map((skill) => skill.name);
  const custom =
    typeof options.customPrompt === "string" && options.customPrompt !== ""
      ? "present"
      : "absent";
  const appended =
    typeof options.appendSystemPrompt === "string" &&
    options.appendSystemPrompt !== ""
      ? fenced(options.appendSystemPrompt)
      : "(none)\n";

  return [
    "# System prompt (best-effort rebuild at command time)\n",
    "Rebuilt from ctx.getSystemPromptOptions() when the command ran. It\n" +
      "excludes per-turn changes made by other extensions; the provider\n" +
      "capture is the ground truth.\n",
    "## Custom prompt\n",
    `${custom}\n`,
    "## Selected tools\n",
    bullets(tools),
    "## Prompt guidelines\n",
    bullets(options.promptGuidelines),
    "## Appended system prompt\n",
    appended,
    "## Context files\n",
    bullets(contextFiles),
    "## Skills\n",
    bullets(skills),
  ].join("\n");
}

export interface DumpHeader {
  timestamp: string;
  provider: string;
  modelId: string;
}

/** Text blocks joined with a blank line; null when the array has none. */
function joinTextBlocks(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  const texts: string[] = [];
  for (const block of blocks) {
    if (
      block !== null &&
      typeof block === "object" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      texts.push((block as { text: string }).text);
    }
  }
  return texts.length === 0 ? null : texts.join("\n\n");
}

/**
 * Pull the system prompt out of a provider payload. Recognizes an Anthropic
 * style `system` (string or text-block array), OpenAI Responses/Codex
 * `instructions`, and an OpenAI chat-style leading `messages[0]` with role
 * `system` or `developer` (string or text-block content). Anything else is
 * null.
 */
export function extractSystemPromptFromPayload(
  payload: unknown,
): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const p = payload as {
    instructions?: unknown;
    system?: unknown;
    messages?: unknown;
  };
  if (typeof p.instructions === "string") return p.instructions;
  if (typeof p.system === "string") return p.system;
  if (Array.isArray(p.system)) return joinTextBlocks(p.system);
  if (Array.isArray(p.messages) && p.messages.length > 0) {
    const first = p.messages[0] as { role?: unknown; content?: unknown };
    if (
      first !== null &&
      typeof first === "object" &&
      (first.role === "system" || first.role === "developer")
    ) {
      if (typeof first.content === "string") return first.content;
      if (Array.isArray(first.content)) return joinTextBlocks(first.content);
    }
  }
  return null;
}

function headerLines(title: string, header: DumpHeader): string {
  return (
    `# ${title}\n` +
    "\n" +
    `- timestamp: ${header.timestamp}\n` +
    `- provider: ${header.provider}\n` +
    `- model: ${header.modelId}\n`
  );
}

/**
 * The provider dump: `md` is the human-readable file, `txt` the raw
 * extracted bytes (null when extraction failed, in which case `md` carries
 * the JSON of the payload, or String(payload) if it cannot be stringified).
 */
export function renderProviderDump(
  header: DumpHeader,
  payload: unknown,
): { md: string; txt: string | null } {
  const head = headerLines("Provider system prompt (ground truth)", header);
  const extracted = extractSystemPromptFromPayload(payload);
  if (extracted !== null) {
    return { md: `${head}\n${fenced(extracted)}`, txt: extracted };
  }
  const note = "Unrecognized payload shape; raw payload follows.\n";
  let body: string;
  try {
    const json = JSON.stringify(payload, null, 2);
    if (typeof json !== "string") throw new TypeError("not serializable");
    body = fenced(json, "json");
  } catch {
    body = `${String(payload)}\n`;
  }
  return { md: `${head}\n${note}\n${body}`, txt: null };
}

// One-shot armed capture state: the raw stamp of the pending inspect, taken
// once by the next provider request.
let armed: string | null = null;

export function armCapture(stamp: string): void {
  armed = stamp;
}

export function takeArmedCapture(): string | null {
  const stamp = armed;
  armed = null;
  return stamp;
}

// Wire pickup for claude-go: with CLAUDE_GO_CAPTURE_DIR set, the bridge's
// child writes one JSON record per API request. The record for this turn
// is the one whose system prompt contains the prompt pi handed over; the
// CLI's own side calls (session naming) carry a different one.

/** One claude-go wiretap record (internal/wiretap.Record). */
export interface WireRecord {
  time?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** The set of files in `dir` now; an unreadable dir counts as empty. */
export function listDir(dir: string): Set<string> {
  try {
    return new Set(fs.readdirSync(dir));
  } catch {
    return new Set();
  }
}

/**
 * Among the files in `dir` absent from `before`, the first POST record
 * whose extracted system prompt contains `needle` (any POST when `needle`
 * is null). Unparseable files are skipped.
 */
export function findWireRecord(
  dir: string,
  before: Set<string>,
  needle: string | null,
): { file: string; record: WireRecord; system: string | null } | null {
  const fresh = [...listDir(dir)].filter((f) => !before.has(f)).sort();
  for (const file of fresh) {
    let record: WireRecord;
    try {
      record = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      continue;
    }
    if (record.method !== "POST") continue;
    const system = extractSystemPromptFromPayload(record.body);
    if (needle === null || (system !== null && system.includes(needle))) {
      return { file, record, system };
    }
  }
  return null;
}

/** Poll `findWireRecord` every `everyMs` until it hits or `timeoutMs` passes. */
export async function awaitWireRecord(
  dir: string,
  before: Set<string>,
  needle: string | null,
  timeoutMs = 20_000,
  everyMs = 250,
): Promise<ReturnType<typeof findWireRecord>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = findWireRecord(dir, before, needle);
    if (hit !== null) return hit;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}

/** The wire dump: readable `.md` and the raw system prompt as sent. */
export function renderWireDump(
  header: DumpHeader,
  file: string,
  record: WireRecord,
  system: string | null,
): { md: string; txt: string | null } {
  const head = headerLines(
    "Wire system prompt (as the claude child sent it)",
    header,
  );
  const body = record.body as { model?: unknown; system?: unknown } | undefined;
  const blocks = Array.isArray(body?.system) ? body.system.length : null;
  const meta =
    `- record: ${file}\n` +
    `- request: ${record.method} ${record.url}\n` +
    `- wire model: ${typeof body?.model === "string" ? body.model : "unknown"}\n` +
    `- system blocks: ${blocks ?? "n/a"}\n`;
  if (system === null) {
    return {
      md: `${head}${meta}\nNo system prompt in the record.\n`,
      txt: null,
    };
  }
  return { md: `${head}${meta}\n${fenced(system)}`, txt: system };
}
