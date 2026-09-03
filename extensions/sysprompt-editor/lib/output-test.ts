/**
 * Standardized output test: the pinned prompt plus the fixture document go
 * through the normal pipeline, and the assistant's reply is written to a
 * dated result file naming the model and the template that rendered.
 */

/** Deliberately bare: the system prompt under test supplies all structure and voice. */
export const OUTPUT_TEST_PROMPT = "Summarize this article for me.";

export interface ResultHeader {
  timestamp: string;
  provider: string;
  modelId: string;
  activeTemplate: string; // "(stock)" when fail-open left the stock prompt
  templateSha256: string | null; // null for "(stock)"
}

/** The user message: pinned prompt, a rule, then the fixture verbatim. */
export function buildTestMessage(fixtureText: string): string {
  return `${OUTPUT_TEST_PROMPT}\n\n---\n\n${fixtureText}`;
}

/** Every character outside [A-Za-z0-9._-] becomes `-`. */
function sanitize(part: string): string {
  return part.replace(/[^A-Za-z0-9._-]/g, "-");
}

/** Result basename (no extension): `<stamp>-<provider>-<modelId>`, sanitized. */
export function resultBase(
  stamp: string,
  provider: string,
  modelId: string,
): string {
  return `${stamp}-${sanitize(provider)}-${sanitize(modelId)}`;
}

/** The result file bytes: header block, rule, then the response verbatim. */
export function formatResult(
  header: ResultHeader,
  responseText: string,
): string {
  const lines = [
    "# Output test",
    "",
    `- timestamp: ${header.timestamp}`,
    `- provider: ${header.provider}`,
    `- model: ${header.modelId}`,
    `- template: ${header.activeTemplate}`,
  ];
  if (header.templateSha256 !== null) {
    lines.push(`- template-sha256: ${header.templateSha256}`);
  }
  lines.push("", "---", "");
  return `${lines.join("\n")}\n${responseText}\n`;
}

/** Text blocks of an assistant message joined with a blank line; "" if none. */
export function assistantText(message: unknown): string {
  if (message === null || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const texts: string[] = [];
  for (const block of content) {
    if (
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      texts.push((block as { text: string }).text);
    }
  }
  return texts.join("\n\n");
}
