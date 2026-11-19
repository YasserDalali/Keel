import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/app/loans?x=1")).toBe("/app/loans?x=1");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.test", "//evil.test", "/\\evil.test", "app"]) expect(safeNext(bad)).toBe("/app");
  });
});
