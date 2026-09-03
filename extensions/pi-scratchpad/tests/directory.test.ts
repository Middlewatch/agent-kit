import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TTL_MS } from "../src/paths.ts";
import { OWNER_FILE, ensureScratchpad, pruneIfEmpty, sweepExpired } from "../src/directory.ts";

/** Nothing in these tests may be reaped because some unrelated pid happens to be live. */
const NOTHING_ALIVE = () => false;

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "pi-scratchpad-test-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** Build `<base>/<slug>/<session>/scratchpad`, optionally with a file, aged by `ageMs`. */
async function seedSession(
  slug: string,
  sessionId: string,
  options: { ageMs?: number; file?: { name: string; ageMs: number } } = {},
): Promise<string> {
  const scratchpad = join(base, slug, sessionId, "scratchpad");
  await mkdir(scratchpad, { recursive: true });
  if (options.file) {
    const path = join(scratchpad, options.file.name);
    await writeFile(path, "x");
    await age(path, options.file.ageMs);
  }
  if (options.ageMs !== undefined) {
    await age(scratchpad, options.ageMs);
    await age(join(base, slug, sessionId), options.ageMs);
  }
  return scratchpad;
}

async function age(path: string, ageMs: number): Promise<void> {
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
}

const OLD = DEFAULT_TTL_MS + 60_000;
const FRESH = 60_000;

describe("ensureScratchpad", () => {
  it("creates the full path and returns it", async () => {
    const dir = await ensureScratchpad("/users/owner/projects/evoker", "sess-a", {
      PI_SCRATCHPAD_BASE: base,
    });
    expect(dir).toBe(join(base, "-users-owner-projects-evoker", "sess-a", "scratchpad"));
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it("is owner-only, since scratch output mirrors repository contents", async () => {
    const dir = await ensureScratchpad("/users/owner/projects/evoker", "sess-a", {
      PI_SCRATCHPAD_BASE: base,
    });
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it("claims the directory for this process so a sweeper will not reap it", async () => {
    const dir = await ensureScratchpad("/users/owner/projects/evoker", "sess-a", {
      PI_SCRATCHPAD_BASE: base,
    });
    const owner = await readFile(join(dir, "..", OWNER_FILE), "utf8");
    expect(Number.parseInt(owner.trim(), 10)).toBe(process.pid);
  });

  it("tightens permissions on a session directory that already existed", async () => {
    const dir = join(base, "-users-owner-projects-evoker", "sess-a", "scratchpad");
    await mkdir(dir, { recursive: true, mode: 0o755 });
    await ensureScratchpad("/users/owner/projects/evoker", "sess-a", { PI_SCRATCHPAD_BASE: base });
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, ".."))).mode & 0o777).toBe(0o700);
  });

  it("is idempotent across restarts of the same session", async () => {
    const env = { PI_SCRATCHPAD_BASE: base };
    const first = await ensureScratchpad("/users/owner/projects/evoker", "sess-a", env);
    await writeFile(join(first, "keep.txt"), "data");
    const second = await ensureScratchpad("/users/owner/projects/evoker", "sess-a", env);
    expect(second).toBe(first);
    expect(await readdir(second)).toEqual(["keep.txt"]);
  });
});

describe("sweepExpired", () => {
  it("removes an idle session past the ttl", async () => {
    await seedSession("-p", "stale", { ageMs: OLD });
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([join(base, "-p", "stale")]);
    await expect(stat(join(base, "-p", "stale"))).rejects.toThrow();
  });

  it("keeps a session that is still inside the ttl", async () => {
    await seedSession("-p", "recent", { ageMs: FRESH });
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
    expect(result.kept).toBe(1);
  });

  it("never reaps the live session, however old its directory looks", async () => {
    const live = await seedSession("-p", "live", { ageMs: OLD });
    const result = await sweepExpired({ base, keep: live, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
    expect((await stat(live)).isDirectory()).toBe(true);
  });

  it("keeps a stale-looking directory whose files are still being written", async () => {
    // Appending to an existing file does not bump any parent directory mtime,
    // which is exactly how a long-running session gets swept out from under itself.
    await seedSession("-p", "appending", { ageMs: OLD, file: { name: "gate.log", ageMs: FRESH } });
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
    expect(result.kept).toBe(1);
  });

  it("reaps a stale session that has stale files", async () => {
    await seedSession("-p", "done", { ageMs: OLD, file: { name: "gate.log", ageMs: OLD } });
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([join(base, "-p", "done")]);
  });

  it("keeps a stale tree whose activity is in a subdirectory", async () => {
    // Writing to scratchpad/logs/gate.log bumps no mtime a shallow scan would see.
    const dir = await seedSession("-p", "nested", { ageMs: OLD, file: { name: "old.txt", ageMs: OLD } });
    const nested = join(dir, "logs");
    await mkdir(nested);
    await writeFile(join(nested, "gate.log"), "live");
    await age(nested, OLD);
    await age(dir, OLD);
    await age(join(dir, ".."), OLD);
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
  });

  it("keeps a stale session whose owning process is still running", async () => {
    // A session can sit open and untouched for longer than the ttl.
    const dir = await seedSession("-p", "idle-but-open", { ageMs: OLD });
    await writeFile(join(dir, "..", OWNER_FILE), `${process.pid}\n`);
    await age(join(dir, "..", OWNER_FILE), OLD);
    await age(join(dir, ".."), OLD);
    const result = await sweepExpired({ base, isProcessAlive: (pid) => pid === process.pid });
    expect(result.removed).toEqual([]);
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it("reaps a stale session whose owner has exited", async () => {
    const dir = await seedSession("-p", "crashed", { ageMs: OLD });
    await writeFile(join(dir, "..", OWNER_FILE), "424242\n");
    // The claim is as old as the dead session that made it.
    await age(join(dir, "..", OWNER_FILE), OLD);
    await age(join(dir, ".."), OLD);
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([join(base, "-p", "crashed")]);
  });

  it("never touches directories that are not scratchpad trees", async () => {
    // The blast radius if someone points PI_SCRATCHPAD_BASE at a home directory
    // or a repository: two levels of ordinary directories, all long untouched.
    const bystander = join(base, "projects", "important");
    await mkdir(join(bystander, "src"), { recursive: true });
    await writeFile(join(bystander, "src", "main.ts"), "work");
    await age(join(bystander, "src", "main.ts"), OLD);
    await age(join(bystander, "src"), OLD);
    await age(bystander, OLD);
    await age(join(base, "projects"), OLD);
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
    expect((await stat(join(bystander, "src", "main.ts"))).isFile()).toBe(true);
  });

  it("sweeps every project, not just the live one", async () => {
    await seedSession("-a", "stale", { ageMs: OLD });
    await seedSession("-b", "stale", { ageMs: OLD });
    const live = await seedSession("-c", "live", { ageMs: FRESH });
    const result = await sweepExpired({ base, keep: live, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed.sort()).toEqual([join(base, "-a", "stale"), join(base, "-b", "stale")]);
    expect(await readdir(base)).toEqual(["-c"]);
  });

  it("does nothing when the ttl is disabled", async () => {
    await seedSession("-p", "stale", { ageMs: OLD });
    const result = await sweepExpired({ base, ttlMs: 0, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([]);
    expect((await stat(join(base, "-p", "stale"))).isDirectory()).toBe(true);
  });

  it("tolerates a base that does not exist yet", async () => {
    const missing = join(base, "not-created");
    const result = await sweepExpired({ base: missing, isProcessAlive: NOTHING_ALIVE });
    expect(result).toEqual({ removed: [], kept: 0, failed: [] });
  });

  it("ignores loose files sitting in the base", async () => {
    await writeFile(join(base, "README"), "not a project");
    await seedSession("-p", "stale", { ageMs: OLD });
    const result = await sweepExpired({ base, isProcessAlive: NOTHING_ALIVE });
    expect(result.removed).toEqual([join(base, "-p", "stale")]);
    expect(result.failed).toEqual([]);
  });
});

describe("pruneIfEmpty", () => {
  it("removes an untouched session tree so idle starts leave no litter", async () => {
    const dir = await seedSession("-p", "unused");
    await writeFile(join(dir, "..", OWNER_FILE), `${process.pid}\n`);
    expect(await pruneIfEmpty(dir)).toBe(true);
    expect(await readdir(base)).toEqual([]);
  });

  it("reports failure rather than claiming success when removal is blocked", async () => {
    const dir = await seedSession("-p", "vanished");
    await rm(dir, { recursive: true });
    expect(await pruneIfEmpty(dir)).toBe(false);
  });

  it("keeps a scratchpad that has content", async () => {
    const dir = await seedSession("-p", "used", { file: { name: "notes.md", ageMs: 0 } });
    expect(await pruneIfEmpty(dir)).toBe(false);
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it("leaves sibling sessions of the same project alone", async () => {
    const unused = await seedSession("-p", "unused");
    await seedSession("-p", "other", { file: { name: "notes.md", ageMs: 0 } });
    expect(await pruneIfEmpty(unused)).toBe(true);
    expect(await readdir(join(base, "-p"))).toEqual(["other"]);
  });
});
