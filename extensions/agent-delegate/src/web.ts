/**
 * Child-side web search over the pinned provider chain
 * serper → brave → tavily, with credentials read from the rpiv-web-tools
 * config (no second credential store). The chain walks forward on request
 * failure or non-2xx; the provider actually used is reported per call.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { truncateUtf8 } from "./protocol.ts";
import { sanitize, scan, type ScanFinding } from "./scan.ts";

export type SearchProviderName = "serper" | "brave" | "tavily";

export interface WebProviderConfig {
  chain: { provider: SearchProviderName; apiKey: string }[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOutcome {
  provider: SearchProviderName;
  results: SearchResult[];
}

export const QUERY_MAX_CHARS = 400;
export const SEARCH_LIMIT_MAX = 10;

const PROVIDER_ORDER: SearchProviderName[] = ["serper", "brave", "tavily"];

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "rpiv-web-tools", "config.json");

/**
 * Read `{provider, apiKeys}` from the rpiv-web-tools config and build the
 * ordered chain from `apiKeys.serper/brave/tavily`, dropping entries without
 * keys. Fails with a clear message on unreadable files, schema drift, or an
 * empty chain (this is a third-party package's file).
 */
export function loadWebProviderConfig(path = DEFAULT_CONFIG_PATH): WebProviderConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`web search is unavailable: provider config not readable at ${path} (${(error as Error).message})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`web search is unavailable: provider config at ${path} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`web search is unavailable: provider config at ${path} is not an object`);
  }
  const apiKeys = (parsed as { apiKeys?: unknown }).apiKeys;
  if (typeof apiKeys !== "object" || apiKeys === null || Array.isArray(apiKeys)) {
    throw new Error(`web search is unavailable: provider config at ${path} has no "apiKeys" object (schema drift?)`);
  }
  const chain: WebProviderConfig["chain"] = [];
  for (const provider of PROVIDER_ORDER) {
    const apiKey = (apiKeys as Record<string, unknown>)[provider];
    if (typeof apiKey === "string" && apiKey.length > 0) chain.push({ provider, apiKey });
  }
  if (chain.length === 0) {
    throw new Error(
      `web search is unavailable: no search provider keys found in ${path} — expected at least one of apiKeys.serper, apiKeys.brave, apiKeys.tavily`,
    );
  }
  return { chain };
}

interface ProviderRequest {
  url: string;
  init: RequestInit;
}

/** Pinned request shapes per provider; every request carries the 30 s timeout signal. */
function buildRequest(provider: SearchProviderName, apiKey: string, query: string, limit: number): ProviderRequest {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  switch (provider) {
    case "serper":
      return {
        url: "https://google.serper.dev/search",
        init: {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: limit }),
          signal,
        },
      };
    case "brave":
      return {
        url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
        init: {
          method: "GET",
          headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
          signal,
        },
      };
    case "tavily":
      return {
        url: "https://api.tavily.com/search",
        init: {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: limit }),
          signal,
        },
      };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * A missing or non-array result path, or a non-empty array with no valid
 * rows, is shape drift and throws (walking the chain) — an explicit empty
 * array is a legitimate zero-hit success. Never a fabricated empty success.
 * Accepted trade-off: a provider that omits its results key
 * entirely on a true zero-hit query is indistinguishable from drift and is
 * walked past loudly — fail-loud beats fabricating an empty success.
 */
function mapItems(provider: SearchProviderName, path: string, items: unknown, urlField: string, snippetField: string): SearchResult[] {
  if (!Array.isArray(items)) {
    throw new Error(`${provider} response shape mismatch: expected an array at ${path}`);
  }
  const results: SearchResult[] = [];
  for (const item of items) {
    const row = asRecord(item);
    if (!row) continue;
    const title = row.title;
    const url = row[urlField];
    if (typeof title !== "string" || typeof url !== "string") continue;
    const snippet = row[snippetField];
    results.push({ title, url, snippet: typeof snippet === "string" ? snippet : "" });
  }
  if (items.length > 0 && results.length === 0) {
    throw new Error(`${provider} response shape mismatch: no item at ${path} carried title and ${urlField}`);
  }
  return results;
}

/** Pinned response mappings per provider. */
function mapResponse(provider: SearchProviderName, body: unknown): SearchResult[] {
  const root = asRecord(body);
  switch (provider) {
    case "serper":
      return mapItems(provider, "organic", root?.organic, "link", "snippet");
    case "brave":
      return mapItems(provider, "web.results", asRecord(root?.web)?.results, "url", "description");
    case "tavily":
      return mapItems(provider, "results", root?.results, "url", "content");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const FETCH_TIMEOUT_MS = 30_000;
export const FETCH_REDIRECT_MAX = 5;
export const FETCH_RAW_CAP_BYTES = 4 * 1024 * 1024;
export const FETCH_TEXT_CAP_BYTES = 64 * 1024;

export interface FetchResult {
  finalUrl: string;
  status: number;
  text: string;
  truncated: boolean;
  findings: ScanFinding[];
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), v4-mapped handled below.
  if (host === "::1" || host === "::") return true;
  if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
  let v4 = host.startsWith("::ffff:") ? host.slice(7) : host;
  // URL normalizes v4-mapped IPv6 to hex groups (::ffff:7f00:1); expand them.
  const hexMapped = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v4);
  if (host.startsWith("::ffff:") && hexMapped) {
    const high = Number.parseInt(hexMapped[1], 16);
    const low = Number.parseInt(hexMapped[2], 16);
    v4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  const octets = v4.split(".");
  if (octets.length === 4 && octets.every((o) => /^\d+$/.test(o) && Number(o) <= 255)) {
    const [a, b] = octets.map(Number);
    if (a === 127 || a === 10 || a === 0) return true; // loopback, private, unspecified
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  }
  return false;
}

/**
 * Scheme and host guard, applied to the initial URL and every redirect hop.
 * Literal loopback/private/link-local addresses and localhost names are
 * denied: a scopeless research child must not probe local
 * services. Residual risk: a public hostname DNS-resolving to a private
 * address is not caught — that requires resolver-level control.
 * `allowPrivateHosts` is a test seam for port-0 fixture servers.
 */
export function assertFetchableUrl(raw: string, allowPrivateHosts = false): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`web_fetch accepts only http and https URLs, not ${url.protocol.replace(/:$/, "")}`);
  }
  if (!allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new Error(`web_fetch refuses local and private-network hosts (${url.hostname})`);
  }
  return url;
}

/** Pull body chunks only until the cap is exceeded; never buffer past cap + one network chunk. */
async function readBodyBounded(
  body: ReadableStream<Uint8Array> | null,
  capBytes: number,
): Promise<{ raw: string; rawTruncated: boolean }> {
  if (!body) return { raw: "", rawTruncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total <= capBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { raw: new TextDecoder().decode(merged), rawTruncated: total > capBytes };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isNaN(code) || code > 0x10ffff ? whole : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** Pinned HTML extraction: drop script/style subtrees, strip remaining tags, decode standard entities. */
function extractHtmlText(html: string): string {
  const withoutSubtrees = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
  const stripped = withoutSubtrees.replace(/<[^>]*>/g, " ");
  return decodeEntities(stripped).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * Hardened fetch: http/https only, ≤5 redirects (followed manually so the
 * cap is enforced here), 30 s request timeout, 4 MiB raw read cap, 64 KiB
 * extracted-text cap. HTML gets the pinned extraction; other content types
 * pass through as text. Every fetched text passes sanitize + scan; findings
 * ride on the result — content is never withheld on a match.
 */
export async function webFetch(
  url: string,
  fetchImpl: typeof fetch = fetch,
  options?: { allowPrivateHosts?: boolean },
): Promise<FetchResult> {
  const allowPrivateHosts = options?.allowPrivateHosts ?? false;
  let current = assertFetchableUrl(url, allowPrivateHosts);
  let response: Response | undefined;
  for (let redirects = 0; ; redirects += 1) {
    try {
      response = await fetchImpl(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`web_fetch failed for ${current}: ${errorMessage(error)}`);
    }
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`web_fetch got HTTP ${response.status} from ${current} with no Location header`);
    }
    if (redirects >= FETCH_REDIRECT_MAX) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`web_fetch stopped after ${FETCH_REDIRECT_MAX} redirects (next was ${location})`);
    }
    await response.body?.cancel().catch(() => {});
    current = assertFetchableUrl(new URL(location, current).toString(), allowPrivateHosts);
  }

  const { raw, rawTruncated } = await readBodyBounded(response.body, FETCH_RAW_CAP_BYTES);
  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = /\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(contentType);
  const extracted = isHtml ? extractHtmlText(raw) : raw;
  const { text: capped, truncated: textTruncated } = truncateUtf8(
    extracted,
    FETCH_TEXT_CAP_BYTES,
    "\n[fetched text truncated]",
  );
  const { text: clean } = sanitize(capped);
  return {
    finalUrl: current.toString(),
    status: response.status,
    text: clean,
    truncated: rawTruncated || textTruncated,
    findings: scan(clean),
  };
}

/**
 * Walk the chain in order; a request failure or non-2xx moves to the next
 * provider. Returns the first success with the provider that served it;
 * throws naming every attempt when the whole chain fails.
 */
export async function webSearch(
  cfg: WebProviderConfig,
  query: string,
  limit = SEARCH_LIMIT_MAX,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchOutcome> {
  if (query.length < 1 || query.length > QUERY_MAX_CHARS) {
    throw new Error(`search query must be 1-${QUERY_MAX_CHARS} characters, got ${query.length}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_LIMIT_MAX) {
    throw new Error(`search limit must be an integer in [1, ${SEARCH_LIMIT_MAX}], got ${limit}`);
  }
  if (cfg.chain.length === 0) {
    throw new Error("web search is unavailable: the provider chain is empty");
  }
  const failures: string[] = [];
  for (const { provider, apiKey } of cfg.chain) {
    const { url, init } = buildRequest(provider, apiKey, query, limit);
    try {
      const response = await fetchImpl(url, init);
      if (!response.ok) {
        failures.push(`${provider}: HTTP ${response.status}`);
        continue;
      }
      const body: unknown = await response.json();
      return { provider, results: mapResponse(provider, body).slice(0, limit) };
    } catch (error) {
      failures.push(`${provider}: ${errorMessage(error)}`);
    }
  }
  throw new Error(`every search provider in the chain failed — ${failures.join("; ")}`);
}
