import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import childScope, { DEFAULT_TURN_CAP, resolveTurnCap } from "../child-scope.ts";

type Handler = (event: Record<string, unknown>) => { block?: boolean; reason?: string } | undefined | void;

/** Minimal ExtensionAPI stub: records registered tools, replays events into handlers. */
function stubPi() {
  const tools = new Map<string, { execute: (id: string, params: unknown) => unknown }>();
  const handlers = new Map<string, Handler[]>();
  const api = {
    registerTool(definition: { name: string; execute: (id: string, params: unknown) => unknown }) {
      tools.set(definition.name, definition);
    },
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  } as unknown as ExtensionAPI;
  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    let outcome: ReturnType<Handler> | undefined;
    for (const handler of handlers.get(event) ?? []) outcome = handler(payload) ?? outcome;
    return outcome ?? undefined;
  };
  return { api, tools, emit };
}

/** Run childScope under a controlled env, capturing stderr marker lines. */
function bootChild(env: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const key of ["AGENT_DELEGATE_PROFILE", "AGENT_DELEGATE_SCOPE_ROOT", "AGENT_DELEGATE_SCOPE_ROOTS", "AGENT_DELEGATE_TURN_CAP"]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  const stderrLines: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const stub = stubPi();
  try {
    childScope(stub.api);
  } finally {
    process.stderr.write = realWrite;
    restoreEnv();
  }

  // Re-capture markers emitted during later event replay too.
  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      return stub.emit(event, payload);
    } finally {
      process.stderr.write = realWrite;
    }
  };
  return { tools: stub.tools, emit, stderrLines };
}

const markers = (lines: string[]) => lines.filter((line) => line.startsWith("AGENT_DELEGATE_EVENT "));

test("registration matrix by env", () => {
  const scoped = bootChild({ AGENT_DELEGATE_PROFILE: "research", AGENT_DELEGATE_SCOPE_ROOT: process.cwd() });
  assert.deepEqual(
    [...scoped.tools.keys()].sort(),
    ["inspect_find", "inspect_git_diff", "inspect_git_status", "inspect_grep", "inspect_ls", "inspect_read", "web_fetch", "web_search"],
    "research + scope registers web and inspect tools",
  );

  const scopeless = bootChild({ AGENT_DELEGATE_PROFILE: "research" });
  assert.deepEqual([...scopeless.tools.keys()].sort(), ["web_fetch", "web_search"], "scopeless research is web only");
  const denied = scopeless.emit("tool_call", { toolName: "inspect_read", input: { path: "x" } });
  assert.equal(denied?.block, true);
  assert.match(String(denied?.reason), /inspect_read is outside the delegated capability set/);

  const prose = bootChild({ AGENT_DELEGATE_SCOPE_ROOT: process.cwd() });
  assert.deepEqual([...prose.tools.keys()].sort(), ["inspect_find", "inspect_git_diff", "inspect_git_status", "inspect_grep", "inspect_ls", "inspect_read"]);
  const noWeb = prose.emit("tool_call", { toolName: "web_fetch", input: { url: "https://x.test" } });
  assert.equal(noWeb?.block, true);
  assert.match(String(noWeb?.reason), /web_fetch is outside the delegated capability set/);

  assert.throws(() => bootChild({}), /a delegated scope root is required/, "prose without scope root fails at startup");
});

test("multi-scope child reads the first root relatively and other roots absolutely", async (t) => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-multiscope-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const first = join(parent, "first");
  const second = join(parent, "second");
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(join(first, "alpha.txt"), "first-root-line\n");
  await writeFile(join(second, "beta.txt"), "second-root-line\n");

  const child = bootChild({ AGENT_DELEGATE_SCOPE_ROOTS: JSON.stringify([first, second]) });
  const read = child.tools.get("inspect_read")!;
  const relative = (await read.execute("t1", { path: "alpha.txt" })) as any;
  assert.match(relative.content[0].text, /first-root-line/, "relative paths resolve against the first scope");
  const absolute = (await read.execute("t2", { path: join(second, "beta.txt") })) as any;
  assert.match(absolute.content[0].text, /second-root-line/, "absolute paths reach the second scope");
  await assert.rejects(
    read.execute("t3", { path: join(parent, "beta.txt") }) as Promise<unknown>,
    /outside every delegated scope/,
    "absolute paths outside every scope are refused",
  );
});

test("git-inspect tools refuse a path that escapes the delegated scope", async (t) => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const parent = await mkdtemp(join(tmpdir(), "agent-delegate-gitesc-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const repo = join(parent, "repo");
  const outside = join(parent, "outside");
  await mkdir(repo, { recursive: true });
  await mkdir(outside, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  git("init", "-q", "-b", "main");
  await writeFile(join(repo, "README.md"), "# scoped\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "root");
  // A second, out-of-scope repo the escape would otherwise reach.
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: outside, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });

  const child = bootChild({ AGENT_DELEGATE_SCOPE_ROOT: repo });
  const status = child.tools.get("inspect_git_status")!;
  const diff = child.tools.get("inspect_git_diff")!;

  // In-scope default works.
  const ok = (await status.execute("g1", {})) as any;
  assert.equal(typeof ok.content[0].text, "string");

  // A relative escape is refused before git runs anywhere.
  await assert.rejects(status.execute("g2", { path: ".." }) as Promise<unknown>, /escapes the delegated scope/);
  await assert.rejects(diff.execute("g3", { path: "../outside" }) as Promise<unknown>, /escapes the delegated scope/);
  // An absolute path outside every scope is refused too.
  await assert.rejects(status.execute("g4", { path: outside }) as Promise<unknown>, /outside every delegated scope/);
});

test("tool calls past turn cap are blocked with wrap-up directive and marker emitted", () => {
  const child = bootChild({ AGENT_DELEGATE_PROFILE: "research", AGENT_DELEGATE_TURN_CAP: "2" });
  child.emit("turn_start", { turnIndex: 0 });
  child.emit("turn_start", { turnIndex: 1 });
  assert.equal(markers(child.stderrLines).length, 0, "no marker inside the cap");
  const inCap = child.emit("tool_call", { toolName: "web_fetch", input: { url: "https://a.test" } });
  assert.equal(inCap, undefined, "calls inside the cap pass");

  child.emit("turn_start", { turnIndex: 2 });
  const capMarkers = markers(child.stderrLines);
  assert.equal(capMarkers.length, 1);
  assert.match(capMarkers[0], /"type":"turn_cap"/);
  assert.match(capMarkers[0], /turn 3 exceeds cap 2/);

  const blocked = child.emit("tool_call", { toolName: "web_fetch", input: { url: "https://a.test" } });
  assert.equal(blocked?.block, true);
  assert.match(String(blocked?.reason), /Turn cap 2 reached\..*wrap up now/i);

  // Cap parsing: default and clamping.
  assert.equal(resolveTurnCap(undefined), DEFAULT_TURN_CAP);
  assert.equal(resolveTurnCap("garbage"), DEFAULT_TURN_CAP);
  assert.equal(resolveTurnCap("0"), 1);
  assert.equal(resolveTurnCap("500"), 100);
});

test("nudge verdict blocks one call with corrective reason", () => {
  const child = bootChild({ AGENT_DELEGATE_PROFILE: "research" });
  const input = { url: "https://dead.test/page" };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assert.equal(child.emit("tool_call", { toolName: "web_fetch", input }), undefined);
    child.emit("tool_result", {
      toolName: "web_fetch",
      input,
      isError: true,
      content: [{ type: "text", text: "HTTP 403" }],
    });
  }
  const nudged = child.emit("tool_call", { toolName: "web_fetch", input });
  assert.equal(nudged?.block, true);
  assert.match(String(nudged?.reason), /failed 3 times in a row/);
  assert.equal(markers(child.stderrLines).filter((line) => line.includes('"type":"loop_halt"')).length, 0, "a nudge is not a halt");
});

test("halt verdict blocks all further calls and emits marker", () => {
  const child = bootChild({ AGENT_DELEGATE_PROFILE: "research", AGENT_DELEGATE_SCOPE_ROOT: process.cwd() });
  const input = { query: "same query" };
  for (let call = 1; call <= 4; call += 1) {
    assert.equal(child.emit("tool_call", { toolName: "web_search", input }), undefined, `call ${call}`);
    child.emit("tool_result", { toolName: "web_search", input, isError: false, content: [{ type: "text", text: "hits" }] });
  }
  const halted = child.emit("tool_call", { toolName: "web_search", input });
  assert.equal(halted?.block, true);
  assert.match(String(halted?.reason), /Loop guard halt .*length-1 cycle 5 consecutive times.*wrap up now/i);
  const haltMarkers = markers(child.stderrLines).filter((line) => line.includes('"type":"loop_halt"'));
  assert.equal(haltMarkers.length, 1);
  assert.match(haltMarkers[0], /"type":"loop_halt"/);

  // Every later call is blocked too, even a different in-matrix tool.
  const after = child.emit("tool_call", { toolName: "inspect_ls", input: { path: "." } });
  assert.equal(after?.block, true);
  assert.match(String(after?.reason), /Loop guard halt/);
});
