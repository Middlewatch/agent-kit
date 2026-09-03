import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  ScratchpadPathError,
  assertSafeSessionId,
  isExpired,
  projectSlug,
  resolveBase,
  resolveTtlMs,
  sessionScratchpad,
} from "../src/paths.ts";

const HOME = "/users/owner";

describe("resolveBase", () => {
  it("prefers an explicit absolute override", () => {
    expect(resolveBase({ PI_SCRATCHPAD_BASE: "/mnt/scratch", HOME })).toBe("/mnt/scratch");
  });

  it("rejects a relative override rather than silently resolving it against cwd", () => {
    expect(() => resolveBase({ PI_SCRATCHPAD_BASE: "scratch", HOME })).toThrow(ScratchpadPathError);
  });

  it("falls back to XDG_CACHE_HOME", () => {
    expect(resolveBase({ XDG_CACHE_HOME: "/users/owner/.cache", HOME })).toBe(
      "/users/owner/.cache/pi-scratchpad",
    );
  });

  it("ignores a relative XDG_CACHE_HOME and uses HOME", () => {
    expect(resolveBase({ XDG_CACHE_HOME: "relative", HOME })).toBe("/users/owner/.cache/pi-scratchpad");
  });

  it("defaults under HOME, never /tmp — /tmp is tmpfs on this host", () => {
    const base = resolveBase({ HOME });
    expect(base).toBe("/users/owner/.cache/pi-scratchpad");
    expect(base.startsWith("/tmp")).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    expect(resolveBase({ PI_SCRATCHPAD_BASE: "   ", XDG_CACHE_HOME: "  ", HOME })).toBe(
      "/users/owner/.cache/pi-scratchpad",
    );
  });
});

describe("projectSlug", () => {
  it("matches Claude Code's convention so both trees read alike", () => {
    expect(projectSlug("/users/owner/projects/evoker")).toBe("-users-owner-projects-evoker");
  });

  it("normalizes trailing separators and traversal", () => {
    expect(projectSlug("/users/owner/projects/evoker/")).toBe("-users-owner-projects-evoker");
    expect(projectSlug("/users/owner/projects/../projects/evoker")).toBe("-users-owner-projects-evoker");
  });

  it("gives the filesystem root a non-empty segment", () => {
    expect(projectSlug("/")).toBe("-root");
  });

  it("rejects a relative cwd", () => {
    expect(() => projectSlug("projects/evoker")).toThrow(ScratchpadPathError);
  });
});

describe("assertSafeSessionId", () => {
  it("accepts a normal uuid", () => {
    expect(assertSafeSessionId("da763bfc-10f5-4bf3-afbb-130ec5bfd9dd")).toBe(
      "da763bfc-10f5-4bf3-afbb-130ec5bfd9dd",
    );
  });

  it.each(["..", ".", "", "   ", "a/b", "a\\b", "..\\..\\etc", "nul\0byte"])(
    "rejects %j",
    (bad) => {
      expect(() => assertSafeSessionId(bad)).toThrow(ScratchpadPathError);
    },
  );
});

describe("sessionScratchpad", () => {
  it("is session-scoped, so concurrent agents in one repo cannot collide", () => {
    const a = sessionScratchpad("/users/owner/projects/evoker", "sess-a", { HOME });
    const b = sessionScratchpad("/users/owner/projects/evoker", "sess-b", { HOME });
    expect(a).not.toBe(b);
    expect(a).toBe("/users/owner/.cache/pi-scratchpad/-users-owner-projects-evoker/sess-a/scratchpad");
  });

  it("keeps every path inside the base", () => {
    const base = resolveBase({ HOME });
    const p = sessionScratchpad("/users/owner/projects/evoker", "sess-a", { HOME });
    expect(p.startsWith(`${base}/`)).toBe(true);
  });
});

describe("resolveTtlMs", () => {
  it("defaults when unset", () => {
    expect(resolveTtlMs({})).toBe(DEFAULT_TTL_MS);
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "  " })).toBe(DEFAULT_TTL_MS);
  });

  it("accepts whole and fractional days", () => {
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "2" })).toBe(2 * 24 * 60 * 60 * 1000);
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "0.5" })).toBe(12 * 60 * 60 * 1000);
  });

  it("treats zero as sweeping disabled", () => {
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "0" })).toBe(0);
  });

  it("falls back rather than reaping everything on a bad value", () => {
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "soon" })).toBe(DEFAULT_TTL_MS);
    expect(resolveTtlMs({ PI_SCRATCHPAD_TTL_DAYS: "-3" })).toBe(DEFAULT_TTL_MS);
  });
});

describe("isExpired", () => {
  const now = 1_000_000_000_000;

  it("keeps a directory touched within the ttl", () => {
    expect(isExpired(now - DEFAULT_TTL_MS + 1, now)).toBe(false);
  });

  it("expires one past the ttl", () => {
    expect(isExpired(now - DEFAULT_TTL_MS - 1, now)).toBe(true);
  });

  it("does not expire on the boundary", () => {
    expect(isExpired(now - DEFAULT_TTL_MS, now)).toBe(false);
  });

  it("never reaps on unusable timestamps", () => {
    expect(isExpired(Number.NaN, now)).toBe(false);
    expect(isExpired(now, Number.NaN)).toBe(false);
  });
});
