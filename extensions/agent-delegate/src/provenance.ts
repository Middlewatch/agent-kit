import { createHash } from "node:crypto";

export interface EvidenceReference {
  kind: "file" | "url";
  target: string;
  startLine?: number;
  endLine?: number;
}

export interface ProvenanceEntry {
  tool: string;
  target: string;
  status: "ok" | "error";
  truncated: boolean;
  sha256: string;
  references: EvidenceReference[];
}

export const MAX_PROVENANCE_ENTRIES = 64;
export const MAX_PROVENANCE_BYTES = 64 * 1024;
const MAX_REFERENCES_PER_ENTRY = 16;
export const MAX_RETURN_CITATIONS = 16;
const MAX_TARGET_CHARS = 512;

function normalizePath(value: string): string {
  return value.replace(/^@/, "").replace(/^\.\//, "").replaceAll("\\", "/").slice(0, MAX_TARGET_CHARS);
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value.replace(/[),.;]+$/, ""));
    url.hash = "";
    return url.toString().slice(0, MAX_TARGET_CHARS);
  } catch {
    return undefined;
  }
}

function uniqueReferences(references: EvidenceReference[], limit = MAX_REFERENCES_PER_ENTRY): EvidenceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.target}:${reference.startLine ?? ""}:${reference.endLine ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

/** Extract URL and path:line citations from model text or inspection output. */
export function extractCitations(text: string, limit = MAX_REFERENCES_PER_ENTRY): EvidenceReference[] {
  const references: EvidenceReference[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const target = normalizeUrl(match[0]);
    if (target) references.push({ kind: "url", target });
  }
  for (const line of text.split("\n")) {
    // Grep output and ordinary citations both use path:line or path:line-line.
    const pattern = /(?:^|[\s(`"'\[])(([A-Za-z0-9_@.][A-Za-z0-9_@./\\-]*)):([1-9]\d*)(?:-([1-9]\d*))?(?=:|\b)/g;
    for (const match of line.matchAll(pattern)) {
      const startLine = Number(match[3]);
      references.push({
        kind: "file",
        target: normalizePath(match[1]),
        startLine,
        endLine: match[4] ? Number(match[4]) : startLine,
      });
    }
  }
  return uniqueReferences(references, limit);
}

/** Build one bounded ledger entry from a completed child tool call. */
export function provenanceFromToolResult(event: {
  toolName: string;
  input: Record<string, unknown>;
  content: unknown;
  details?: Record<string, unknown>;
  isError?: boolean;
}): ProvenanceEntry {
  const text = Array.isArray(event.content)
    ? event.content.map((part) => typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("\n")
    : "";
  const details = event.details ?? {};
  const inputTarget = typeof event.input.path === "string" ? normalizePath(event.input.path)
    : typeof event.input.url === "string" ? normalizeUrl(event.input.url) ?? event.input.url
    : typeof event.input.query === "string" ? event.input.query
    : ".";
  const target = typeof details.finalUrl === "string" ? normalizeUrl(details.finalUrl) ?? details.finalUrl : inputTarget;
  const references = extractCitations(text);
  if (event.toolName === "inspect_read" && typeof event.input.path === "string") {
    const numbered = [...text.matchAll(/^([1-9]\d*):/gm)].map((match) => Number(match[1]));
    if (numbered.length) {
      references.push({
        kind: "file",
        target: normalizePath(event.input.path),
        startLine: Math.min(...numbered),
        endLine: Math.max(...numbered),
      });
    }
  }
  if (event.toolName === "web_fetch" && typeof details.finalUrl === "string") {
    const finalUrl = normalizeUrl(details.finalUrl);
    if (finalUrl) references.push({ kind: "url", target: finalUrl });
  }
  if (event.toolName === "inspect_git_diff") {
    let path: string | undefined;
    for (const line of text.split("\n")) {
      const file = /^\+\+\+ b\/(.+)$/.exec(line);
      if (file) path = normalizePath(file[1]);
      const hunk = /^@@ -\d+(?:,\d+)? \+([1-9]\d*)(?:,(\d+))? @@/.exec(line);
      if (!path || !hunk) continue;
      const startLine = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) references.push({ kind: "file", target: path, startLine, endLine: startLine + count - 1 });
    }
  }
  return {
    tool: event.toolName,
    target,
    status: event.isError ? "error" : "ok",
    truncated: details.truncated === true || /\[(?:inspection output )?truncated/i.test(text),
    sha256: createHash("sha256").update(text).digest("hex"),
    references: uniqueReferences(references),
  };
}

function referenceMatches(citation: EvidenceReference, evidence: EvidenceReference): boolean {
  if (citation.kind !== evidence.kind || citation.target !== evidence.target) return false;
  if (citation.kind === "url") return true;
  if (citation.startLine === undefined) return true;
  if (evidence.startLine === undefined) return false;
  const citationEnd = citation.endLine ?? citation.startLine;
  const evidenceEnd = evidence.endLine ?? evidence.startLine;
  return citation.startLine >= evidence.startLine && citationEnd <= evidenceEnd;
}

/** Return citations in the answer that no successful tool result supports. */
export function unmatchedCitations(text: string, ledger: ProvenanceEntry[]): EvidenceReference[] {
  const available = ledger.filter((entry) => entry.status === "ok").flatMap((entry) => entry.references);
  const citations = extractCitations(text, MAX_RETURN_CITATIONS + 1);
  const unmatched = citations.slice(0, MAX_RETURN_CITATIONS)
    .filter((citation) => !available.some((evidence) => referenceMatches(citation, evidence)));
  if (citations.length > MAX_RETURN_CITATIONS) {
    unmatched.push({ kind: "file", target: "[citation-count-exceeds-audit-cap]" });
  }
  return unmatched;
}
