/** Run: node --test lib.test.ts (Node 22.18+ strips types natively). */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertFetchable,
  buildChain,
  formatSearch,
  htmlTitle,
  htmlToText,
  prettyJson,
  relaxQuery,
  truncateText,
  unusableReason,
  webFetch,
  webSearch,
  type WebConfig,
} from "./lib.ts";

const CONFIG: WebConfig = { provider: "brave", apiKeys: { serper: "s", brave: "b", tavily: "t" } };
const names = (config: WebConfig, first?: string, env = {}) => buildChain(config, first, env).map((entry) => entry.provider.name);

/** A fetch that answers from a host → [status, body] table and records the URLs and bodies it saw. */
function fakeFetch(routes: Record<string, [number, unknown] | (() => [number, unknown])>, headers: Record<string, string> = {}) {
  const calls: string[] = [];
  const impl = (async (input: string, init?: RequestInit) => {
    const host = new URL(input).host;
    calls.push(`${host} ${init?.body ?? new URL(input).searchParams.get("q") ?? ""}`);
    const route = routes[host];
    if (!route) throw new Error(`unrouted ${host}`);
    const [status, body] = typeof route === "function" ? route() : route;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const braveHit = { web: { results: [{ title: "T", url: "https://a.example/x", description: "  two\n words " }] } };
const options = (impl: typeof fetch, unusable = new Map<string, string>()) => ({ count: 5, timeoutMs: 1000, fetchImpl: impl, unusable });

test("chain puts the configured provider first and drops unkeyed ones", () => {
  assert.deepEqual(names(CONFIG), ["brave", "tavily", "serper"]);
  assert.deepEqual(names({ apiKeys: { serper: "s" } }), ["serper"]);
  assert.deepEqual(names({}), []);
});

test("a per-call provider outranks the environment, which outranks the config", () => {
  assert.deepEqual(names(CONFIG, undefined, { WEB_SEARCH_PROVIDER: "tavily" }), ["tavily", "brave", "serper"]);
  assert.deepEqual(names(CONFIG, "serper", { WEB_SEARCH_PROVIDER: "tavily" }), ["serper", "brave", "tavily"]);
  assert.deepEqual(names({}, undefined, { EXA_API_KEY: "e" }), ["exa"]);
  assert.throws(() => buildChain(CONFIG, "exa", {}), /"exa" has no API key; keyed providers: brave, tavily, serper/);
});

test("spent quota and rejected keys are unusable, rate limits and outages are not", () => {
  assert.equal(unusableReason(402, '{"code":"USAGE_LIMIT_EXCEEDED"}'), "out of quota");
  assert.equal(unusableReason(400, '{"message":"Not enough credits"}'), "out of quota");
  assert.equal(unusableReason(432, ""), "out of quota");
  assert.equal(unusableReason(401, "Unauthorized"), "key rejected");
  assert.equal(unusableReason(429, "Too Many Requests"), undefined);
  assert.equal(unusableReason(503, ""), undefined);
});

test("relaxQuery drops quotes and site paths, and leaves plain queries alone", () => {
  assert.equal(relaxQuery('"exact phrase" zig  build'), "exact phrase zig build");
  assert.equal(relaxQuery("site:github.com/ziglang/zig build system"), "site:github.com build system");
  assert.equal(relaxQuery("site:ziglang.org build system"), undefined);
  assert.equal(relaxQuery("plain  keywords"), undefined);
});

test("search maps results and collapses snippet whitespace", async () => {
  const { impl } = fakeFetch({ "api.search.brave.com": [200, braveHit] });
  const outcome = await webSearch(buildChain(CONFIG, undefined, {}), "q", options(impl));
  assert.deepEqual(outcome, { provider: "brave", results: [{ title: "T", url: "https://a.example/x", snippet: "two words" }], skipped: [] });
  assert.equal(formatSearch("q", outcome), "1. T\n   https://a.example/x\n   two words");
});

test("an exhausted provider is skipped, reported, and not asked again", async () => {
  const { impl, calls } = fakeFetch({
    "api.search.brave.com": [402, { error: { code: "USAGE_LIMIT_EXCEEDED" } }],
    "api.tavily.com": [200, { results: [{ title: "T", url: "https://b.example/", content: "c" }] }],
  });
  const unusable = new Map<string, string>();
  const chain = buildChain(CONFIG, undefined, {});
  const first = await webSearch(chain, "q", options(impl, unusable));
  assert.equal(first.provider, "tavily");
  assert.deepEqual(first.skipped, ["brave: out of quota"]);
  assert.match(formatSearch("q", first), /^\[results from tavily; brave: out of quota\]\n1\. T/);
  assert.deepEqual([...unusable], [["brave", "out of quota"]]);

  const second = await webSearch(chain, "q", options(impl, unusable));
  assert.deepEqual(second.skipped, ["brave: out of quota"]);
  assert.equal(calls.filter((call) => call.startsWith("api.search.brave.com")).length, 1);
});

test("a transient failure falls through without being remembered", async () => {
  const { impl } = fakeFetch({ "api.search.brave.com": [503, "down"], "api.tavily.com": [200, { results: [] }] });
  const unusable = new Map<string, string>();
  const outcome = await webSearch(buildChain(CONFIG, undefined, {}), "q", options(impl, unusable));
  assert.equal(outcome.provider, "tavily");
  assert.deepEqual(outcome.skipped, ["brave: HTTP 503 down"]);
  assert.equal(unusable.size, 0);
  assert.equal(formatSearch("q", outcome), '[results from tavily; brave: HTTP 503 down]\nNo results for "q".');
});

test("when every provider is marked unusable they are all tried again", async () => {
  const { impl, calls } = fakeFetch({ "api.search.brave.com": [200, braveHit] });
  const unusable = new Map([["brave", "out of quota"]]);
  const outcome = await webSearch(buildChain({ apiKeys: { brave: "b" } }, undefined, {}), "q", options(impl, unusable));
  assert.equal(outcome.provider, "brave");
  assert.deepEqual(outcome.skipped, []);
  assert.equal(calls.length, 1);
});

test("the error names every provider when the whole chain fails", async () => {
  const { impl } = fakeFetch({ "api.search.brave.com": [402, ""], "api.tavily.com": [500, "boom"], "google.serper.dev": [400, "Not enough credits"] });
  await assert.rejects(
    webSearch(buildChain(CONFIG, undefined, {}), "q", options(impl)),
    /every search provider failed \(brave: out of quota; tavily: HTTP 500 boom; serper: out of quota\)/,
  );
  await assert.rejects(webSearch([], "q", options(impl)), /no API key/);
});

test("an empty answer to a constrained query is retried once, relaxed, on the same provider", async () => {
  let n = 0;
  const { impl, calls } = fakeFetch({ "api.search.brave.com": () => [200, n++ === 0 ? { web: { results: [] } } : braveHit] });
  const outcome = await webSearch(buildChain(CONFIG, undefined, {}), '"hall of niceness" wvw', options(impl));
  assert.equal(outcome.relaxedQuery, "hall of niceness wvw");
  assert.deepEqual(calls, ['api.search.brave.com "hall of niceness" wvw', "api.search.brave.com hall of niceness wvw"]);
  assert.match(formatSearch('"hall of niceness" wvw', outcome), /^\[no results for the exact query; showing results for: hall of niceness wvw\]\n1\. T/);
});

test("an empty answer to a plain query costs one request", async () => {
  const { impl, calls } = fakeFetch({ "api.search.brave.com": [200, { web: { results: [] } }] });
  const outcome = await webSearch(buildChain(CONFIG, undefined, {}), "plain words", options(impl));
  assert.deepEqual(outcome.results, []);
  assert.equal(calls.length, 1);
});

test("a user abort propagates instead of walking the chain", async () => {
  const controller = new AbortController();
  controller.abort();
  const impl = (async (_url: string, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    throw new Error("unreachable");
  }) as unknown as typeof fetch;
  await assert.rejects(webSearch(buildChain(CONFIG, undefined, {}), "q", { ...options(impl), signal: controller.signal }), { name: "AbortError" });
});

test("htmlToText drops chrome, keeps code blocks, and marks headings and list items", () => {
  const html = `<html><head><title> A &amp; B </title><style>p{}</style></head><body><!-- c --><script>x()</script>
    <h2>Head</h2><p>one\n   two&nbsp;&#233; three</p><ul><li>a</li><li> b </li></ul><pre><code>if x:\n    y &lt; 1</code></pre></body></html>`;
  assert.equal(htmlTitle(html), "A & B");
  assert.equal(htmlToText(html), "## Head\n\none two é three\n\n- a\n- b\n\n```\nif x:\n    y < 1\n```");
});

test("links are dropped by default and kept on request, same-site ones as paths", () => {
  const html = `<p><a href="/docs/a?x=1#y">Docs</a> <a href='https://other.example/p'>Other</a> <a href="#top">Top</a> <a href="mailto:a@b.c">Mail</a> <a href="/img"><img src=x></a> <a href=https://bare.example/>https://bare.example/</a></p>`;
  assert.equal(htmlToText(html, { base: "https://site.example/page" }), "Docs Other Top Mail https://bare.example/");
  assert.equal(
    htmlToText(html, { base: "https://site.example/page", links: true }),
    "[Docs](/docs/a?x=1#y) [Other](https://other.example/p) Top Mail https://bare.example/",
  );
});

test("prettyJson indents minified JSON and passes anything else through", () => {
  assert.equal(prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(prettyJson("not json"), "not json");
});

test("truncateText cuts on a line when it can and never returns nothing", () => {
  assert.deepEqual(truncateText("short", 10), { text: "short", truncated: false, totalBytes: 5 });
  assert.equal(truncateText("aaaa\nbbbb\ncccc", 11).text, "aaaa\nbbbb");
  assert.equal(truncateText("x".repeat(100), 10).text, "x".repeat(10));
  assert.equal(truncateText("ééééé", 5).text, "éé");
});

test("assertFetchable refuses other schemes and private hosts", () => {
  assert.throws(() => assertFetchable("file:///etc/passwd"), /http and https only/);
  assert.throws(() => assertFetchable("nonsense"), /Invalid URL/);
  for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "[::1]"]) {
    assert.throws(() => assertFetchable(`http://${host}/`), /private and loopback/);
  }
  assert.equal(assertFetchable("https://example.com/a").hostname, "example.com");
});

test("webFetch converts by content type and refuses binaries", async () => {
  const page = fakeFetch({ "h.example": [200, "<title>T</title><p>Body</p>"] }, { "content-type": "text/html; charset=utf-8" });
  const html = await webFetch("https://h.example/", { timeoutMs: 1000, fetchImpl: page.impl });
  assert.deepEqual({ title: html.title, text: html.text, contentType: html.contentType }, { title: "T", text: "Body", contentType: "text/html" });
  assert.equal((await webFetch("https://h.example/", { raw: true, timeoutMs: 1000, fetchImpl: page.impl })).text, "<title>T</title><p>Body</p>");

  const api = fakeFetch({ "j.example": [200, '{"a":1}'] }, { "content-type": "application/json" });
  assert.equal((await webFetch("https://j.example/", { timeoutMs: 1000, fetchImpl: api.impl })).text, '{\n  "a": 1\n}');

  const pdf = fakeFetch({ "p.example": [200, "%PDF"] }, { "content-type": "application/pdf" });
  await assert.rejects(webFetch("https://p.example/", { timeoutMs: 1000, fetchImpl: pdf.impl }), /Unsupported content type application\/pdf/);

  const missing = fakeFetch({ "m.example": [404, ""] });
  await assert.rejects(webFetch("https://m.example/x", { timeoutMs: 1000, fetchImpl: missing.impl }), /HTTP 404/);
});
