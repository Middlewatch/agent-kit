/**
 * web-tools core: provider chain search and plain-HTTP fetch. No pi imports,
 * so `node --test lib.test.ts` runs without an install.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Shared with agent-delegate's research children, which read the same keys. */
export const CONFIG_PATH = join(homedir(), ".config", "rpiv-web-tools", "config.json");
export const DEFAULT_TIMEOUT_SECONDS = 30;

export interface WebConfig {
  /** Provider tried first; the other keyed providers follow in table order. */
  provider?: string;
  apiKeys?: Record<string, string>;
  requestTimeoutSeconds?: number;
}

/** A missing or malformed file reads as an empty config; keys may still come from the environment. */
export function loadConfig(path = CONFIG_PATH): WebConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as WebConfig) : {};
  } catch {
    return {};
  }
}

export function timeoutMs(config: WebConfig): number {
  const seconds = config.requestTimeoutSeconds;
  return (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TIMEOUT_SECONDS) * 1000;
}

// ---------------------------------------------------------------------------
// Search providers
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface Provider {
  name: string;
  /** Environment variable that overrides the config key. */
  env: string;
  request(key: string, query: string, count: number): { url: string; init: RequestInit };
  /** The result array inside the response body. */
  rows(body: Record<string, any>): unknown;
  urlField: string;
  snippetField: string;
}

const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const PROVIDERS: readonly Provider[] = [
  {
    name: "brave",
    env: "BRAVE_SEARCH_API_KEY",
    request: (key, query, count) => ({
      url: `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(count), result_filter: "web", text_decorations: "false" })}`,
      init: { headers: { Accept: "application/json", "X-Subscription-Token": key } },
    }),
    rows: (body) => body.web?.results ?? [],
    urlField: "url",
    snippetField: "description",
  },
  {
    name: "tavily",
    env: "TAVILY_API_KEY",
    request: (key, query, count) => ({
      url: "https://api.tavily.com/search",
      init: json({ Authorization: `Bearer ${key}` }, { query, max_results: count }),
    }),
    rows: (body) => body.results ?? [],
    urlField: "url",
    snippetField: "content",
  },
  {
    name: "exa",
    env: "EXA_API_KEY",
    request: (key, query, count) => ({
      url: "https://api.exa.ai/search",
      init: json({ "x-api-key": key }, { query, numResults: count, contents: { text: { maxCharacters: 300 } } }),
    }),
    rows: (body) => body.results ?? [],
    urlField: "url",
    snippetField: "text",
  },
  {
    name: "firecrawl",
    env: "FIRECRAWL_API_KEY",
    request: (key, query, count) => ({
      url: "https://api.firecrawl.dev/v1/search",
      init: json({ Authorization: `Bearer ${key}` }, { query, limit: count }),
    }),
    rows: (body) => body.data ?? [],
    urlField: "url",
    snippetField: "description",
  },
  {
    name: "serper",
    env: "SERPER_API_KEY",
    request: (key, query, count) => ({
      url: "https://google.serper.dev/search",
      init: json({ "X-API-KEY": key }, { q: query, num: count }),
    }),
    rows: (body) => body.organic ?? [],
    urlField: "link",
    snippetField: "snippet",
  },
];

export interface ChainEntry {
  provider: Provider;
  key: string;
}

/**
 * Keyed providers in try order: `first` (a per-call choice), else
 * WEB_SEARCH_PROVIDER, else `config.provider`, then the rest in table order.
 * An unknown or unkeyed `first` throws, since the caller named it.
 */
export function buildChain(config: WebConfig, first?: string, env: NodeJS.ProcessEnv = process.env): ChainEntry[] {
  const keyed: ChainEntry[] = [];
  for (const provider of PROVIDERS) {
    const key = env[provider.env]?.trim() || config.apiKeys?.[provider.name]?.trim();
    if (key) keyed.push({ provider, key });
  }
  if (first !== undefined && !keyed.some((entry) => entry.provider.name === first)) {
    throw new Error(`web_search provider "${first}" has no API key; keyed providers: ${keyed.map((entry) => entry.provider.name).join(", ") || "none"}`);
  }
  const preferred = first ?? (env.WEB_SEARCH_PROVIDER?.trim() || config.provider);
  return [...keyed.filter((entry) => entry.provider.name === preferred), ...keyed.filter((entry) => entry.provider.name !== preferred)];
}

/**
 * Why a provider should be skipped for the rest of the session, or undefined
 * when the failure is transient. Spent quota and rejected keys do not recover
 * on retry: Brave answers 402 USAGE_LIMIT_EXCEEDED, Serper 400 "Not enough
 * credits", Tavily 432/433.
 */
export function unusableReason(status: number, body: string): string | undefined {
  if (status === 402 || status === 432 || status === 433) return "out of quota";
  if (/not enough credits|usage.?limit|quota|insufficient (credits|balance|funds)/i.test(body)) return "out of quota";
  if (status === 401 || status === 403) return "key rejected";
  return undefined;
}

/**
 * Drop the constraints that most often produce an empty page: exact-phrase
 * quotes and the path part of `site:host/path`. Returns undefined when the
 * query has neither. In the session logs plain queries came back empty 0-1%
 * of the time, quoted ones 26-57%, and `site:` with a path 35%.
 */
export function relaxQuery(query: string): string | undefined {
  const relaxed = query
    .replace(/"([^"]*)"/g, "$1")
    .replace(/\bsite:([^\s/]+)\/\S*/g, "site:$1")
    .replace(/\s+/g, " ")
    .trim();
  return relaxed === query.replace(/\s+/g, " ").trim() ? undefined : relaxed;
}

export interface SearchOutcome {
  provider: string;
  results: SearchResult[];
  /** Set when the exact query was empty and these results answer this relaxed query. */
  relaxedQuery?: string;
  /** One entry per provider tried or skipped before the one that answered. */
  skipped: string[];
}

export interface SearchOptions {
  count: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Session memory of spent or rejected providers: name → reason. Mutated. */
  unusable?: Map<string, string>;
  fetchImpl?: typeof fetch;
}

class ProviderError extends Error {
  /** Set when the provider should be skipped for the rest of the session. */
  unusable?: string;
  constructor(message: string, unusable?: string) {
    super(message);
    this.unusable = unusable;
  }
}

async function query(entry: ChainEntry, text: string, options: SearchOptions): Promise<SearchResult[]> {
  const { url, init } = entry.provider.request(entry.key, text, options.count);
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { ...init, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ProviderError(deadline.aborted ? `no answer within ${options.timeoutMs / 1000}s` : errorText(error));
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const reason = unusableReason(response.status, body);
    throw new ProviderError(reason ?? `HTTP ${response.status} ${body.slice(0, 200)}`.trim(), reason);
  }
  let rows: unknown;
  try {
    rows = entry.provider.rows((await response.json()) as Record<string, any>);
  } catch {
    rows = undefined;
  }
  if (!Array.isArray(rows)) throw new ProviderError("unexpected response shape");
  const results: SearchResult[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const link = row?.[entry.provider.urlField];
    if (typeof link !== "string" || !link) continue;
    const snippet = row[entry.provider.snippetField];
    results.push({
      title: typeof row.title === "string" ? row.title : "",
      url: link,
      snippet: typeof snippet === "string" ? snippet.replace(/\s+/g, " ").trim() : "",
    });
  }
  return results.slice(0, options.count);
}

/**
 * Walk the chain until a provider answers. A provider that is out of quota or
 * rejects its key is remembered in `options.unusable` and skipped on later
 * calls; when every provider is marked, all are tried again rather than
 * failing without a request. An empty answer to a query with quotes or a
 * `site:` path is retried once, relaxed, on the same provider.
 */
export async function webSearch(chain: ChainEntry[], text: string, options: SearchOptions): Promise<SearchOutcome> {
  if (chain.length === 0) {
    throw new Error(`web_search has no API key: add one under "apiKeys" in ${CONFIG_PATH} (${PROVIDERS.map((p) => p.name).join(", ")})`);
  }
  const unusable = options.unusable ?? new Map<string, string>();
  const live = chain.filter((entry) => !unusable.has(entry.provider.name));
  const attempt = live.length > 0 ? live : chain;
  const skipped = chain.filter((entry) => !attempt.includes(entry)).map((entry) => `${entry.provider.name}: ${unusable.get(entry.provider.name)}`);
  for (const entry of attempt) {
    const name = entry.provider.name;
    try {
      const results = await query(entry, text, options);
      const relaxed = results.length === 0 ? relaxQuery(text) : undefined;
      if (relaxed === undefined) return { provider: name, results, skipped };
      const second = await query(entry, relaxed, options);
      return second.length > 0 ? { provider: name, results: second, relaxedQuery: relaxed, skipped } : { provider: name, results, skipped };
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      if (error.unusable) unusable.set(name, error.unusable);
      skipped.push(`${name}: ${error.message}`);
    }
  }
  throw new Error(`every search provider failed (${skipped.join("; ")})`);
}

/** Model-facing text: numbered results, preceded by a note only when something was substituted. */
export function formatSearch(text: string, outcome: SearchOutcome): string {
  const notes: string[] = [];
  if (outcome.skipped.length > 0) notes.push(`[results from ${outcome.provider}; ${outcome.skipped.join("; ")}]`);
  if (outcome.relaxedQuery) notes.push(`[no results for the exact query; showing results for: ${outcome.relaxedQuery}]`);
  if (outcome.results.length === 0) notes.push(`No results for "${text}".`);
  const rows = outcome.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`);
  return [...notes, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export const FETCH_MAX_BYTES = 50 * 1024;
const DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; pi-web-tools/1.0)";
const BINARY_TYPE = /^(image|video|audio|font)\/|^application\/(pdf|zip|gzip|octet-stream|x-tar|wasm)/i;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** http(s) only, and no literal loopback, link-local, or private-network host. */
export function assertFetchable(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`web_fetch reads http and https only, not ${url.protocol}`);
  if (isPrivateHost(url.hostname)) throw new Error(`web_fetch refuses private and loopback hosts (${url.hostname})`);
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? whole;
    const hex = entity[1] === "x" || entity[1] === "X";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isNaN(code) || code > 0x10ffff ? whole : String.fromCodePoint(code);
  });
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, " ");
const squash = (text: string): string => decodeEntities(text).replace(/\s+/g, " ").trim();

export function htmlTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return (match && squash(stripTags(match[1]))) || undefined;
}

/**
 * Reduce HTML to text. `<pre>` keeps its line structure, headings and list
 * items get a marker, everything else is whitespace-collapsed. With `links`,
 * anchors survive as `[text](url)` so the model can follow a page instead of
 * guessing URLs; same-site targets are written as the path alone, which
 * resolves against `base`. Links cost a median 3.4 KB per page (p90 19 KB)
 * over 60 pages from the session logs, so they are opt-in.
 */
export function htmlToText(html: string, options: { base?: string; links?: boolean } = {}): string {
  const { base } = options;
  const kept: string[] = [];
  const keep = (text: string): string => `\u0000${kept.push(text) - 1}\u0000`;
  let origin: string | undefined;
  try {
    origin = base ? new URL(base).origin : undefined;
  } catch {
    origin = undefined;
  }

  let text = html
    .replaceAll("\u0000", "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_, body: string) => {
      const code = decodeEntities(body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/^\n+|\s+$/g, "");
      return code ? `<p>${keep(`\`\`\`\n${code}\n\`\`\``)}</p>` : "";
    })
    .replace(/\s+/g, " ");
  if (options.links) text = text.replace(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi, (_, dq, sq, bare, inner: string) => {
      const label = squash(stripTags(inner));
      const href = decodeEntities(String(dq ?? sq ?? bare ?? "")).trim();
      if (!label) return " ";
      if (!href || href.startsWith("#")) return label;
      let target: URL;
      try {
        target = new URL(href, base);
      } catch {
        return label;
      }
      if (target.protocol !== "http:" && target.protocol !== "https:") return label;
      const shown = target.origin === origin ? target.pathname + target.search + target.hash : target.toString();
      return label === href || label === target.toString() ? keep(target.toString()) : keep(`[${label}](${shown})`);
    });
  text = text
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<(p|table|blockquote|section|article)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|table|blockquote|section|article|header|footer|nav|details|summary|dd|dt)\s*>/gi, "\n");

  text = decodeEntities(stripTags(text))
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    // List markers and separators left with no text of their own.
    .replace(/^[-|•·»›]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)]);
}

/** Cut at a line break at or under `maxBytes` when there is one, else mid-line on a character boundary. */
export function truncateText(text: string, maxBytes = FETCH_MAX_BYTES): { text: string; truncated: boolean; totalBytes: number } {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return { text, truncated: false, totalBytes: bytes.length };
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  const head = bytes.subarray(0, end).toString("utf8");
  const lineEnd = head.lastIndexOf("\n");
  return { text: lineEnd > head.length / 2 ? head.slice(0, lineEnd) : head, truncated: true, totalBytes: bytes.length };
}

export interface FetchOutcome {
  /** URL after redirects. */
  url: string;
  title?: string;
  contentType: string;
  /** Converted body, untruncated. */
  text: string;
}

export async function webFetch(
  raw: string,
  options: { raw?: boolean; links?: boolean; timeoutMs: number; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<FetchOutcome> {
  const url = assertFetchable(raw);
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url.toString(), {
      signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5" },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(deadline.aborted ? `${url} did not answer within ${options.timeoutMs / 1000}s` : `fetch failed for ${url}: ${errorText(error)}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(response.headers.get("content-length") ?? 0);
  if (BINARY_TYPE.test(contentType) || length > DOWNLOAD_MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      BINARY_TYPE.test(contentType)
        ? `Unsupported content type ${contentType}: web_fetch reads text. Download the file with bash instead.`
        : `Body is ${length} bytes, over the ${DOWNLOAD_MAX_BYTES}-byte limit. Download the file with bash instead.`,
    );
  }
  const body = await response.text();
  const finalUrl = response.url || url.toString();
  if (options.raw) return { url: finalUrl, contentType, text: body };
  if (contentType.includes("html")) {
    return { url: finalUrl, title: htmlTitle(body), contentType, text: htmlToText(body, { base: finalUrl, links: options.links }) };
  }
  if (contentType.includes("json")) return { url: finalUrl, contentType, text: prettyJson(body) };
  return { url: finalUrl, contentType, text: body };
}

/** Minified JSON is one long line, which truncation would cut mid-value; re-indent it so the cut lands on a line. */
export function prettyJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function errorText(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return (error instanceof Error ? error.message : String(error)) + cause;
}
