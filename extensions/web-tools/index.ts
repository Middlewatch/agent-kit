/**
 * web-tools: `web_search` over a keyed provider chain with fallback, and
 * `web_fetch` over plain HTTP. `/web-tools` shows the chain. The logic lives
 * in lib.ts; this file is the pi registration.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { buildChain, CONFIG_PATH, FETCH_MAX_BYTES, formatSearch, loadConfig, timeoutMs, truncateText, webFetch, webSearch } from "./lib.ts";

const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;

export default function webTools(pi: ExtensionAPI): void {
  /** Providers found out of quota or rejecting their key; cleared when a session starts. */
  const unusable = new Map<string, string>();
  pi.on("session_start", () => unusable.clear());

  const keyed = buildChain(loadConfig()).map((entry) => entry.provider.name);

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web. Returns numbered results: title, URL, snippet.",
    promptSnippet: "Search the web for up-to-date information",
    promptGuidelines: ["Use web_search for information beyond your training data."],
    parameters: Type.Object({
      query: Type.String({
        description: 'Plain keywords work best. Exact-phrase quotes and site:host/path filters often return nothing; use them only when the constraint matters.',
      }),
      max_results: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULTS, description: `Default ${DEFAULT_RESULTS}.` })),
      // Offered only when there is a choice; the chain falls back on its own.
      ...(keyed.length > 1
        ? {
            provider: Type.Optional(
              Type.Unsafe<string>({ type: "string", enum: keyed, description: "Try this provider first, for this call only." }),
            ),
          }
        : {}),
    }),

    async execute(_id, params, signal) {
      const config = loadConfig();
      const provider = (params as { provider?: string }).provider;
      if (provider) unusable.delete(provider);
      const count = Math.min(Math.max(params.max_results ?? DEFAULT_RESULTS, 1), MAX_RESULTS);
      const outcome = await webSearch(buildChain(config, provider), params.query, { count, timeoutMs: timeoutMs(config), signal, unusable });
      return {
        content: [{ type: "text", text: formatSearch(params.query, outcome) }],
        details: { query: params.query, backend: outcome.provider, resultCount: outcome.results.length, relaxedQuery: outcome.relaxedQuery, skipped: outcome.skipped },
      };
    },

    renderCall(args, theme) {
      const via = (args as { provider?: string }).provider;
      return new Text(theme.fg("toolTitle", theme.bold("WebSearch ")) + theme.fg("accent", `"${args.query}"`) + (via ? theme.fg("dim", ` via ${via}`) : ""), 0, 0);
    },

    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      const details = result.details as { resultCount?: number; backend?: string; relaxedQuery?: string; skipped?: string[] } | undefined;
      const count = details?.resultCount ?? 0;
      let text = theme.fg(count > 0 ? "success" : "warning", `${count > 0 ? "✓" : "∅"} ${count} result${count === 1 ? "" : "s"}`);
      if (details?.backend) text += theme.fg("dim", ` (${details.backend})`);
      if (details?.relaxedQuery) text += theme.fg("warning", " relaxed");
      if (details?.skipped?.length) text += theme.fg("warning", ` skipped ${details.skipped.join("; ")}`);
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: `Fetch an http(s) URL as text. HTML is reduced to text and JSON is indented. Output over ${FETCH_MAX_BYTES / 1024} KB is cut and the full text saved to a file.`,
    promptSnippet: "Fetch and read content from a specific URL",
    promptGuidelines: [
      "Use web_fetch to read the full content of a specific URL.",
      'After answering using search results or fetched content, include a "Sources:" section with a markdown hyperlink to the fetched URL.',
    ],
    parameters: Type.Object({
      url: Type.String(),
      links: Type.Optional(Type.Boolean({ description: "Keep link targets as [text](url), for finding the next page to fetch. Same-site targets are paths." })),
      raw: Type.Optional(Type.Boolean({ description: "Return the body unconverted." })),
    }),

    async execute(_id, params, signal) {
      const fetched = await webFetch(params.url, { raw: params.raw, links: params.links, timeoutMs: timeoutMs(loadConfig()), signal });
      const cut = truncateText(fetched.text);
      const header = [fetched.title ? `Title: ${fetched.title}` : "", fetched.url !== params.url ? `URL: ${fetched.url}` : ""].filter(Boolean);
      let text = (header.length > 0 ? `${header.join("\n")}\n\n` : "") + cut.text;
      let fullOutputPath: string | undefined;
      if (cut.truncated) {
        fullOutputPath = join(await mkdtemp(join(tmpdir(), "pi-web-fetch-")), "content.txt");
        await writeFile(fullOutputPath, fetched.text, "utf8");
        text += `\n\n[Truncated at ${Buffer.byteLength(cut.text)} of ${cut.totalBytes} bytes. Full text: ${fullOutputPath}]`;
      }
      return {
        content: [{ type: "text", text }],
        details: { url: fetched.url, title: fetched.title, contentType: fetched.contentType, bytes: cut.totalBytes, truncated: cut.truncated, fullOutputPath },
      };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("WebFetch ")) + theme.fg("accent", args.url), 0, 0);
    },

    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
      const details = result.details as { title?: string; bytes?: number; truncated?: boolean } | undefined;
      let text = theme.fg("success", "✓ Fetched");
      if (details?.title) text += theme.fg("muted", `: ${details.title}`);
      if (details?.bytes !== undefined) text += theme.fg("dim", ` (${(details.bytes / 1024).toFixed(1)} KB)`);
      if (details?.truncated) text += theme.fg("warning", " truncated");
      return new Text(text, 0, 0);
    },
  });

  pi.registerCommand("web-tools", {
    description: "Show the web_search provider chain and which providers this session has given up on",
    handler: async (_args, ctx) => {
      const chain = buildChain(loadConfig()).map((entry) => entry.provider.name);
      const lines = [
        `config: ${CONFIG_PATH}`,
        `chain: ${chain.join(" → ") || "(no API keys)"}`,
        ...[...unusable].map(([name, reason]) => `skipping ${name}: ${reason}`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
