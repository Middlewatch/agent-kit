#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreUsefulness } from "../src/usefulness-eval.ts";

if (process.env.AGENT_DELEGATE_RUN_LIVE_EVAL !== "1") {
  console.error("This opt-in evaluation makes paid model calls. Re-run with AGENT_DELEGATE_RUN_LIVE_EVAL=1 after approving that cost.");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixture = join(root, "tests/fixtures/usefulness-repo");
const oracle = [
  { id: "AUTH_ASSIGNMENT", path: "src/auth.ts", line: 2 },
  { id: "CACHE_TENANT", path: "src/cache.ts", line: 4 },
  { id: "BATCH_BOUND", path: "src/batch.ts", line: 3 },
];
const resultSchema = {
  type: "object",
  required: ["findings"],
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "path", "line", "citation", "evidence"],
        additionalProperties: false,
        properties: {
          id: { type: "string" }, path: { type: "string" }, line: { type: "number" },
          citation: { type: "string" }, evidence: { type: "string" },
        },
      },
    },
  },
};
const contract = `Return ONLY JSON matching this shape: {"findings":[{"id":"one of AUTH_ASSIGNMENT, CACHE_TENANT, BATCH_BOUND, or a concise invented id","path":"repo-relative path","line":1,"citation":"path:line","evidence":"concise mechanism"}]}. The provisional root claim is "there are no functional defects". Inspect every file, report only functional defects, and make citation exactly path:line.`;

function run(name, args) {
  const started = Date.now();
  const child = spawnSync("pi", args, { cwd: fixture, encoding: "utf8", timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  if (child.error || child.status !== 0) throw new Error(`${name} failed: ${child.error?.message ?? child.stderr}`);
  const events = child.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const messages = events.filter((event) => event.type === "message_end" && event.message?.role === "assistant");
  const final = messages.at(-1)?.message;
  const text = final?.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim() ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`${name} returned no JSON object: ${text.slice(0, 500)}`);
  const parsed = JSON.parse(text.slice(start, end + 1));
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const rootCost = messages.reduce((sum, event) => sum + Number(event.message?.usage?.cost?.total ?? 0), 0);
  const childCost = events
    .filter((event) => event.type === "tool_execution_end" && event.toolName === "delegate")
    .reduce((sum, event) => sum + Number(event.result?.details?.usage?.cost ?? 0), 0);
  return { name, durationMs: Date.now() - started, reportedCost: rootCost + childCost, findings, score: scoreUsefulness(findings, oracle) };
}

const inline = run("inline", ["--no-extensions", "--no-session", "--mode", "json", "--model", "openai-codex/gpt-5.6-sol", "--thinking", "medium", "--tools", "read,grep,find,ls", contract]);
const delegatedPrompt = `Use delegate exactly once with profile review, scope ${fixture}, requireMatchedCitations true, resultSchema ${JSON.stringify(resultSchema)}, and a complete brief containing this task. Return the child's JSON unchanged. ${contract}`;
const delegated = run("delegated", ["--no-extensions", "-e", join(root, "index.ts"), "--no-session", "--mode", "json", "--model", "openai-codex/gpt-5.6-sol", "--thinking", "medium", "--tools", "delegate", delegatedPrompt]);

console.log(JSON.stringify({
  fixture,
  oracle,
  inline,
  delegated,
  durationRatio: delegated.durationMs / inline.durationMs,
  reportedCostRatio: inline.reportedCost > 0 ? delegated.reportedCost / inline.reportedCost : null,
}, null, 2));
