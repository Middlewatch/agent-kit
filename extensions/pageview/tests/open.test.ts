import { describe, expect, it } from "vitest";
import { parseOpenCommand } from "../src/open.ts";

describe("parseOpenCommand", () => {
  it("parses a bare single-file xdg-open or open invocation", () => {
    expect(parseOpenCommand("xdg-open lessons/0001-intro.html")).toEqual({
      target: "lessons/0001-intro.html",
    });
    expect(parseOpenCommand("open ./page.html")).toEqual({ target: "./page.html" });
    expect(parseOpenCommand("  xdg-open diagram.svg  ")).toEqual({
      target: "diagram.svg",
    });
  });

  it("unwraps a quoted target", () => {
    expect(parseOpenCommand('xdg-open "draft one.html"')).toEqual({
      target: "draft one.html",
    });
    expect(parseOpenCommand("xdg-open 'draft one.html'")).toEqual({
      target: "draft one.html",
    });
  });

  it("leaves compound and multi-argument commands alone", () => {
    expect(parseOpenCommand("make && xdg-open out.html")).toBeUndefined();
    expect(parseOpenCommand("xdg-open a.html b.html")).toBeUndefined();
    expect(parseOpenCommand("xdg-open out.html; echo done")).toBeUndefined();
    expect(parseOpenCommand("xdg-open $(latest).html")).toBeUndefined();
  });

  it("ignores web URLs and unrelated commands", () => {
    expect(parseOpenCommand("xdg-open https://example.com")).toBeUndefined();
    expect(parseOpenCommand("reopen file.html")).toBeUndefined();
    expect(parseOpenCommand("openssl x509 -in cert.pem")).toBeUndefined();
    expect(parseOpenCommand("ls lessons/")).toBeUndefined();
  });
});
