import http from "node:http";
import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";

export const DEFAULT_BASE_PORT = 8722;
const DEFAULT_MAX_PORT_TRIES = 20;

/** SSE endpoint the injected script listens on; reserved, never a file. */
export const EVENTS_PATH = "/__pageview__/events";
const RELOAD_DEBOUNCE_MS = 60;

export const RELOAD_SCRIPT = `<script>new EventSource("${EVENTS_PATH}").onmessage = () => location.reload();</script>`;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export interface ServeOptions {
  docroot: string;
  host: string;
  /** First port to try; increments on conflict. Default 8722. */
  basePort?: number;
  maxPortTries?: number;
}

export interface PageServer {
  readonly host: string;
  readonly port: number;
  readonly docroot: string;
  /** Map an absolute file path inside the docroot to a fetchable URL. */
  urlFor(filePath: string): string;
  close(): Promise<void>;
}

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function within(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

type Resolution =
  | { kind: "ok"; filePath: string }
  | { kind: "bad-request" }
  | { kind: "forbidden" }
  | { kind: "not-found" };

/**
 * Resolve a request path to a real file inside the docroot. Escapes via `..`
 * (encoded or not) and symlinks that leave the docroot are refused; the
 * refusal never confirms what exists outside.
 */
async function resolveRequest(realDocroot: string, rawPath: string): Promise<Resolution> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(new URL(rawPath, "http://placeholder").pathname);
  } catch {
    return { kind: "bad-request" };
  }
  // A dot-dot segment is refused outright rather than normalized back inside
  // the docroot, where `/../foo` would silently alias `/foo`.
  if (decoded.split("/").includes("..")) return { kind: "forbidden" };
  const joined = path.resolve(realDocroot, "." + path.posix.normalize("/" + decoded));
  if (!within(realDocroot, joined)) return { kind: "forbidden" };

  let real: string;
  try {
    real = await fs.realpath(joined);
  } catch {
    return { kind: "not-found" };
  }
  if (!within(realDocroot, real)) return { kind: "forbidden" };

  const stat = await fs.stat(real);
  if (stat.isDirectory()) {
    let realIndex: string;
    try {
      realIndex = await fs.realpath(path.join(real, "index.html"));
    } catch {
      return { kind: "not-found" };
    }
    // index.html gets the same symlink containment as any other target.
    if (!within(realDocroot, realIndex)) return { kind: "forbidden" };
    return { kind: "ok", filePath: realIndex };
  }
  return { kind: "ok", filePath: real };
}

function listen(server: http.Server, host: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (err.code === "EADDRINUSE" || err.code === "EACCES") resolve(false);
      else reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function startPageServer(options: ServeOptions): Promise<PageServer> {
  const realDocroot = await fs.realpath(options.docroot);
  const basePort = options.basePort ?? DEFAULT_BASE_PORT;
  const maxTries = options.maxPortTries ?? DEFAULT_MAX_PORT_TRIES;

  // Live reload state: watch the directory of every file actually served
  // (editors save via atomic rename, so watching the file itself goes stale)
  // and broadcast one debounced reload to every open SSE client.
  const sseClients = new Set<http.ServerResponse>();
  const watchers = new Map<string, { watcher: FSWatcher; names: Set<string> }>();
  let reloadTimer: NodeJS.Timeout | undefined;

  const broadcastReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const client of sseClients) client.write("data: reload\n\n");
    }, RELOAD_DEBOUNCE_MS);
  };

  const watchServedFile = (filePath: string) => {
    const dir = path.dirname(filePath);
    let entry = watchers.get(dir);
    if (!entry) {
      let watcher: FSWatcher;
      try {
        watcher = watch(dir, (_eventType, filename) => {
          if (filename && watchers.get(dir)?.names.has(filename)) broadcastReload();
        });
      } catch {
        return; // a dir that cannot be watched just loses live reload
      }
      watcher.on("error", () => {
        // A deleted or replaced directory kills its watcher; drop it so the
        // next serve of a file there recreates the watch.
        watchers.delete(dir);
        try {
          watcher.close();
        } catch {}
      });
      entry = { watcher, names: new Set() };
      watchers.set(dir, entry);
    }
    entry.names.add(path.basename(filePath));
  };

  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    if ((req.url ?? "").split("?")[0] === EVENTS_PATH) {
      if (req.method !== "GET") {
        // A HEAD here would otherwise linger forever as a phantom SSE client.
        res.writeHead(405, { allow: "GET" }).end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      res.write(": pageview\n\n");
      sseClients.add(res);
      res.on("close", () => sseClients.delete(res));
      return;
    }
    let resolution: Resolution;
    try {
      resolution = await resolveRequest(realDocroot, req.url ?? "/");
    } catch {
      res.writeHead(500).end();
      return;
    }
    if (resolution.kind !== "ok") {
      const status =
        resolution.kind === "forbidden" ? 403 : resolution.kind === "bad-request" ? 400 : 404;
      res.writeHead(status, { "content-type": "text/plain" }).end(String(status));
      return;
    }
    try {
      const raw = await fs.readFile(resolution.filePath);
      const contentType = contentTypeFor(resolution.filePath);
      const body = contentType.startsWith("text/html")
        ? Buffer.concat([raw, Buffer.from("\n" + RELOAD_SCRIPT)])
        : raw;
      watchServedFile(resolution.filePath);
      res.writeHead(200, {
        "content-type": contentType,
        "content-length": body.byteLength,
        "cache-control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("404");
    }
  });

  let port = basePort;
  if (basePort === 0) {
    if (!(await listen(server, options.host, 0))) {
      throw new Error("pageview: could not bind an ephemeral port");
    }
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("pageview: unexpected server address");
    }
    port = address.port;
  } else {
    let bound = false;
    for (let i = 0; i < maxTries && !bound; i++) {
      port = basePort + i;
      bound = await listen(server, options.host, port);
    }
    if (!bound) {
      throw new Error(
        `pageview: ports ${basePort}-${basePort + maxTries - 1} on ${options.host} are all taken`,
      );
    }
  }

  return {
    host: options.host,
    port,
    docroot: realDocroot,
    urlFor(filePath: string): string {
      const rel = path.relative(realDocroot, path.resolve(filePath));
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`pageview: ${filePath} is outside the docroot ${realDocroot}`);
      }
      const encoded = rel.split(path.sep).map(encodeURIComponent).join("/");
      return `http://${options.host}:${port}/${encoded}`;
    },
    close(): Promise<void> {
      clearTimeout(reloadTimer);
      for (const { watcher } of watchers.values()) watcher.close();
      watchers.clear();
      for (const client of sseClients) client.end();
      sseClients.clear();
      return new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
