import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELOAD_SCRIPT, startPageServer, type PageServer } from "../src/server.ts";

const HOST = "127.0.0.1";

let servers: PageServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

async function fixture(): Promise<string> {
  const docroot = await mkdtemp(join(tmpdir(), "pageview-lr-"));
  await mkdir(join(docroot, "assets"));
  await writeFile(join(docroot, "page.html"), "<!doctype html><body>v1</body>");
  await writeFile(join(docroot, "assets", "style.css"), "body { margin: 0 }");
  await writeFile(join(docroot, "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  return docroot;
}

async function start(docroot: string): Promise<PageServer> {
  const server = await startPageServer({ docroot, host: HOST });
  servers.push(server);
  return server;
}

/** Open the SSE endpoint and resolve on the first data: line. */
function nextReloadEvent(port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: HOST, port, path: "/__pageview__/events" },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`SSE endpoint returned ${res.statusCode}`));
          return;
        }
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          const dataLine = chunk
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (dataLine) {
            clearTimeout(timer);
            req.destroy();
            resolve(dataLine.slice("data:".length).trim());
          }
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("no SSE event before timeout"));
    }, timeoutMs);
    req.on("error", () => {}); // destroyed on purpose after resolve
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("live reload", () => {
  it("injects the reload script into HTML responses only", async () => {
    const docroot = await fixture();
    const server = await start(docroot);
    const html = await (await fetch(`http://${HOST}:${server.port}/page.html`)).text();
    expect(html).toBe("<!doctype html><body>v1</body>" + "\n" + RELOAD_SCRIPT);
    const css = await (await fetch(`http://${HOST}:${server.port}/assets/style.css`)).text();
    expect(css).toBe("body { margin: 0 }");
    const svg = await (await fetch(`http://${HOST}:${server.port}/logo.svg`)).text();
    expect(svg).toBe("<svg xmlns='http://www.w3.org/2000/svg'/>");
  });

  it("leaves the file on disk untouched", async () => {
    const docroot = await fixture();
    const server = await start(docroot);
    await fetch(`http://${HOST}:${server.port}/page.html`);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(join(docroot, "page.html"), "utf8")).toBe(
      "<!doctype html><body>v1</body>",
    );
  });

  it("broadcasts a reload when a served file changes", async () => {
    const docroot = await fixture();
    const server = await start(docroot);
    await fetch(`http://${HOST}:${server.port}/page.html`); // serve => watch
    const event = nextReloadEvent(server.port, 2000);
    await sleep(100); // let the SSE connection and watcher settle
    await writeFile(join(docroot, "page.html"), "<!doctype html><body>v2</body>");
    expect(await event).toBe("reload");
  });

  it("broadcasts when a served asset changes, and stays quiet for unserved files", async () => {
    const docroot = await fixture();
    await writeFile(join(docroot, "unserved.html"), "<p>never fetched</p>");
    const server = await start(docroot);
    await fetch(`http://${HOST}:${server.port}/page.html`);
    await fetch(`http://${HOST}:${server.port}/assets/style.css`);

    const quiet = nextReloadEvent(server.port, 600);
    await sleep(100);
    await writeFile(join(docroot, "unserved.html"), "<p>still never fetched</p>");
    await expect(quiet).rejects.toThrow("no SSE event");

    const event = nextReloadEvent(server.port, 2000);
    await sleep(100);
    await writeFile(join(docroot, "assets", "style.css"), "body { margin: 1px }");
    expect(await event).toBe("reload");
  });
});
