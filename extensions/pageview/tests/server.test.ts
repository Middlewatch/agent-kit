import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELOAD_SCRIPT, startPageServer, type PageServer } from "../src/server.ts";

const HOST = "127.0.0.1";

let servers: PageServer[] = [];
let blockers: NetServer[] = [];

afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
  await Promise.all(
    blockers.map(
      (b) => new Promise<void>((resolve) => b.close(() => resolve())),
    ),
  );
  blockers = [];
});

async function start(docroot: string, basePort?: number): Promise<PageServer> {
  const server = await startPageServer({ docroot, host: HOST, basePort });
  servers.push(server);
  return server;
}

/** Docroot shaped like a teach workspace, with a secret outside it. */
async function fixture(): Promise<{ docroot: string; outside: string }> {
  const base = await mkdtemp(join(tmpdir(), "pageview-test-"));
  const docroot = join(base, "workspace");
  await mkdir(join(docroot, "lessons"), { recursive: true });
  await mkdir(join(docroot, "assets"), { recursive: true });
  await writeFile(
    join(docroot, "lessons", "0001-intro.html"),
    "<!doctype html><html><body>café ☕</body></html>",
  );
  await writeFile(join(docroot, "assets", "style.css"), "body { margin: 0 }");
  await writeFile(join(base, "secret.txt"), "outside the docroot");
  return { docroot, outside: join(base, "secret.txt") };
}

/** GET with a hand-built path, bypassing fetch's URL normalization. */
function rawGet(
  port: number,
  rawPath: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: HOST, port, path: rawPath, method: "GET" },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function occupy(port: number): Promise<NetServer> {
  return new Promise((resolve, reject) => {
    const blocker = createNetServer();
    blocker.once("error", reject);
    blocker.listen(port, HOST, () => resolve(blocker));
    blockers.push(blocker);
  });
}

describe("startPageServer", () => {
  it("serves HTML with its MIME type, body intact plus the reload script", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/lessons/0001-intro.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe(
      "<!doctype html><html><body>café ☕</body></html>" + "\n" + RELOAD_SCRIPT,
    );
  });

  it("serves sibling assets so relative links resolve", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/assets/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await res.text()).toBe("body { margin: 0 }");
  });

  it("returns 404 for a missing file", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/lessons/nope.html`);
    expect(res.status).toBe(404);
  });

  it("never lets dot-dot forms read outside the docroot", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    // The WHATWG URL parser clamps dot segments (plain and %2e-encoded) at
    // the root, so these resolve to /secret.txt inside the docroot, where no
    // such file exists. The outside file is unreachable either way.
    for (const path of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/lessons/../../secret.txt",
    ]) {
      const res = await rawGet(server.port, path);
      expect(res.status).toBe(404);
      expect(res.body).not.toContain("outside the docroot");
    }
    // An encoded slash survives URL parsing as one segment and is the one
    // form our own dot-dot check must refuse.
    const encoded = await rawGet(server.port, "/..%2Fsecret.txt");
    expect(encoded.status).toBe(403);
    expect(encoded.body).not.toContain("outside the docroot");
  });

  it("refuses a symlink that points outside the docroot", async () => {
    const { docroot, outside } = await fixture();
    await symlink(outside, join(docroot, "leak.html"));
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/leak.html`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("outside the docroot");
  });

  it("refuses a directory index that is a symlink out of the docroot", async () => {
    const { docroot, outside } = await fixture();
    await mkdir(join(docroot, "public"));
    await symlink(outside, join(docroot, "public", "index.html"));
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/public/`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("outside the docroot");
  });

  it("rejects non-GET methods", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    const res = await fetch(`http://${HOST}:${server.port}/lessons/0001-intro.html`, {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });

  it("falls back to the next port when the base port is taken", async () => {
    const { docroot } = await fixture();
    const probe = await start(docroot, 0); // OS-assigned, guaranteed free range anchor
    const anchor = probe.port;
    await probe.close();
    servers = servers.filter((s) => s !== probe);
    await occupy(anchor);
    const server = await start(docroot, anchor);
    expect(server.port).toBe(anchor + 1);
  });

  it("close() frees the port", async () => {
    const { docroot } = await fixture();
    const server = await start(docroot);
    const { port } = server;
    await server.close();
    servers = servers.filter((s) => s !== server);
    await expect(fetch(`http://${HOST}:${port}/`)).rejects.toThrow();
  });

  it("urlFor maps an absolute file path to an encoded URL", async () => {
    const { docroot } = await fixture();
    await writeFile(join(docroot, "draft one.html"), "<p>hi</p>");
    const server = await start(docroot);
    const url = server.urlFor(join(docroot, "draft one.html"));
    expect(url).toBe(`http://${HOST}:${server.port}/draft%20one.html`);
    const res = await fetch(url);
    expect(res.status).toBe(200);
  });
});
