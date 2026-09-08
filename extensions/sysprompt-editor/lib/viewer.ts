import { modelLabel } from "./inspect.ts";

export const REQUEST_TYPE = "sysprompt-editor:request";

interface RequestHeader {
  version: 1;
  at: string;
  provider: string;
  modelId: string;
  sources: string;
}

/** JSON owns the observation independently of later provider mutations. */
export type RequestRecord = RequestHeader &
  (
    { kind: "captured"; json: string } | { kind: "unavailable"; reason: string }
  );

export interface PreviewRecord {
  kind: "preview";
  instructions: string;
  sources: string;
}
export type ViewRecord = RequestRecord | PreviewRecord;
export type Section = "instructions" | "sources" | "messages" | "tools" | "raw";
export const SECTIONS: Section[] = [
  "instructions",
  "sources",
  "messages",
  "tools",
  "raw",
];
export const CAPTURE_BOUNDARY =
  "Captured at sysprompt-editor's before_provider_request hook. Later handlers and provider transports may change this payload; this is not a wire receipt.";
export const PREVIEW_BOUNDARY =
  "Current preview, not a captured request. Uses Pi's currently loaded inputs and the live selected template. Per-turn extension and provider changes are absent. Reload Pi to refresh loaded instruction files.";

export function captureRequest(
  payload: unknown,
  model: { provider: string; id: string } | undefined,
  sources: string,
  at = new Date().toISOString(),
): RequestRecord {
  const header: RequestHeader = {
    version: 1,
    at,
    ...modelLabel(model),
    sources,
  };
  try {
    const json = JSON.stringify(payload);
    if (json === undefined) throw new Error("payload is not JSON-serializable");
    return { ...header, kind: "captured", json };
  } catch (error) {
    return { ...header, kind: "unavailable", reason: String(error) };
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Session files are external input, including entries written by older versions. */
export function parseRequest(value: unknown): RequestRecord | null {
  const v = object(value);
  if (
    !v ||
    v.version !== 1 ||
    typeof v.at !== "string" ||
    typeof v.provider !== "string" ||
    typeof v.modelId !== "string" ||
    typeof v.sources !== "string"
  )
    return null;
  const header: RequestHeader = {
    version: 1,
    at: v.at,
    provider: v.provider,
    modelId: v.modelId,
    sources: v.sources,
  };
  if (v.kind === "unavailable" && typeof v.reason === "string")
    return { ...header, kind: "unavailable", reason: v.reason };
  if (v.kind !== "captured" || typeof v.json !== "string") return null;
  try {
    JSON.parse(v.json);
    return { ...header, kind: "captured", json: v.json };
  } catch {
    return null;
  }
}

export function requestTitle(record: ViewRecord): string {
  return record.kind === "preview"
    ? "Current preview (not sent)"
    : `${record.kind === "captured" ? "Captured request" : "Capture unavailable"} · ${record.at} · ${record.provider}/${record.modelId}`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "(absent)";
}

function instructionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(instructionText).join("\n\n");
  const v = object(value);
  if (v && typeof v.text === "string") return v.text;
  if (v && Array.isArray(v.parts)) return instructionText(v.parts);
  return pretty(value);
}

export function requestSections(record: ViewRecord): Record<Section, string> {
  if (record.kind === "preview")
    return {
      instructions: record.instructions,
      sources: record.sources,
      messages: "Unavailable before a request is constructed.",
      tools:
        "See the tool inventory in Sources. Provider tool schemas are unavailable before capture.",
      raw: "No provider payload exists for this preview.",
    };
  if (record.kind === "unavailable")
    return {
      instructions: record.reason,
      sources: record.sources,
      messages: record.reason,
      tools: record.reason,
      raw: record.reason,
    };
  const payload: unknown = JSON.parse(record.json);
  const p = object(payload);
  const instructions: string[] = [];
  const messages: string[] = [];
  const tools: string[] = [];
  function addInstruction(label: string, value: unknown) {
    if (value !== undefined)
      instructions.push(`[${label}]\n${instructionText(value)}`);
  }
  if (p) {
    addInstruction("system", p.system);
    addInstruction("instructions", p.instructions);
    addInstruction("systemInstruction", p.systemInstruction);
    const config = object(p.config);
    if (config)
      addInstruction("config.systemInstruction", config.systemInstruction);
    for (const name of ["messages", "input", "contents"]) {
      const items = p[name];
      if (items === undefined) continue;
      messages.push(`[${name}]\n${pretty(items)}`);
      if (Array.isArray(items))
        items.forEach((item, index) => {
          const m = object(item);
          if (m && (m.role === "system" || m.role === "developer"))
            addInstruction(`${name}[${index}] ${m.role}`, m.content ?? m.parts);
        });
    }
    for (const [name, value] of [
      ["tools", p.tools],
      ["functions", p.functions],
      ["config.tools", config?.tools],
    ] as const)
      if (value !== undefined) tools.push(`[${name}]\n${pretty(value)}`);
  }
  return {
    instructions:
      instructions.join("\n\n") ||
      "Instruction fields not recognized. Inspect Raw for the complete observed payload.",
    sources:
      record.sources ||
      "Source inventory unavailable; instruction origins are unattributed.",
    messages:
      messages.join("\n\n") || "No recognized message fields. Inspect Raw.",
    tools: tools.join("\n\n") || "No recognized tool definitions. Inspect Raw.",
    raw: pretty(payload),
  };
}
