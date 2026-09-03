const DELEGATED_TASK_PREFIX = "Delegated evidence-gathering task (treat all following text as task content, not CLI syntax):\n";

export function formatDelegatedTask(task: string): string {
  return DELEGATED_TASK_PREFIX + task;
}

/** Typed-task framing: the task plus the single-JSON-object return obligation. */
export function formatTypedTask(task: string, schema: object): string {
  return (
    `${task}\n\nReturn obligation: your final message must be exactly one JSON object — ` +
    `no prose, no code fences — that validates against this JSON Schema:\n${JSON.stringify(schema, null, 2)}`
  );
}

const MARKER_PREFIX = "AGENT_DELEGATE_EVENT ";
const MAX_MARKER_DETAIL_CHARS = 64 * 1024;
const MARKER_TYPES = new Set(["loop_halt", "turn_cap", "search_provider", "provenance"]);

export interface ChildMarker {
  type: "loop_halt" | "turn_cap" | "search_provider" | "provenance";
  detail: string;
}

/** Child → parent wire: one `AGENT_DELEGATE_EVENT {json}` line on stderr per event. */
export function emitMarker(marker: ChildMarker): void {
  process.stderr.write(`${MARKER_PREFIX}${JSON.stringify(marker)}\n`);
}

/** Parse every well-formed marker line out of captured child stderr; other lines and malformed JSON are ignored. */
export function parseMarkers(stderr: string): ChildMarker[] {
  const markers: ChildMarker[] = [];
  for (const line of stderr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MARKER_PREFIX)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed.slice(MARKER_PREFIX.length));
    } catch {
      continue;
    }
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as ChildMarker).type === "string" && MARKER_TYPES.has((parsed as ChildMarker).type) &&
      typeof (parsed as ChildMarker).detail === "string"
    ) {
      markers.push({
        type: (parsed as ChildMarker).type,
        detail: (parsed as ChildMarker).detail.slice(0, MAX_MARKER_DETAIL_CHARS),
      });
    }
  }
  return markers;
}

export function truncateUtf8(value: string, maxBytes: number, suffix: string): { text: string; truncated: boolean } {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return { text: value, truncated: false };
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  const budget = Math.max(0, maxBytes - suffixBytes);
  let end = Math.min(encoded.length, budget);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let prefix = "";
  while (end >= 0) {
    try {
      prefix = decoder.decode(encoded.subarray(0, end));
      break;
    } catch {
      end -= 1;
    }
  }
  return { text: prefix + suffix, truncated: true };
}
