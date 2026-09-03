import { describe, expect, it } from "vitest";
import { shouldAnnounce } from "../src/trigger.ts";

const cwd = "/srv/user/workspace";

function ev(overrides: Partial<Parameters<typeof shouldAnnounce>[0]> = {}) {
  return {
    toolName: "write",
    path: "lessons/0001-intro.html" as string | undefined,
    isError: false,
    cwd,
    ...overrides,
  };
}

describe("shouldAnnounce", () => {
  it("announces a written html file inside the cwd", () => {
    expect(shouldAnnounce(ev(), new Set())).toEqual({
      absolute: `${cwd}/lessons/0001-intro.html`,
    });
  });

  it("announces svg and pdf, absolute paths included", () => {
    expect(shouldAnnounce(ev({ path: `${cwd}/diagram.svg` }), new Set())).toEqual({
      absolute: `${cwd}/diagram.svg`,
    });
    expect(shouldAnnounce(ev({ path: "print/report.pdf" }), new Set())).toEqual({
      absolute: `${cwd}/print/report.pdf`,
    });
  });

  it("ignores other extensions and missing paths", () => {
    expect(shouldAnnounce(ev({ path: "notes.md" }), new Set())).toBeUndefined();
    expect(shouldAnnounce(ev({ path: "script.js" }), new Set())).toBeUndefined();
    expect(shouldAnnounce(ev({ path: undefined }), new Set())).toBeUndefined();
  });

  it("ignores tools other than write and failed writes", () => {
    expect(shouldAnnounce(ev({ toolName: "edit" }), new Set())).toBeUndefined();
    expect(shouldAnnounce(ev({ toolName: "bash", path: "x.html" }), new Set())).toBeUndefined();
    expect(shouldAnnounce(ev({ isError: true }), new Set())).toBeUndefined();
  });

  it("ignores files outside the cwd", () => {
    expect(shouldAnnounce(ev({ path: "/etc/motd.html" }), new Set())).toBeUndefined();
    expect(shouldAnnounce(ev({ path: "../elsewhere/page.html" }), new Set())).toBeUndefined();
  });

  it("announces a file only once", () => {
    const announced = new Set<string>();
    const first = shouldAnnounce(ev(), announced);
    expect(first).toBeDefined();
    announced.add(first!.absolute);
    expect(shouldAnnounce(ev(), announced)).toBeUndefined();
  });

  it("is case-insensitive on the extension", () => {
    expect(shouldAnnounce(ev({ path: "REPORT.PDF" }), new Set())).toEqual({
      absolute: `${cwd}/REPORT.PDF`,
    });
  });
});
