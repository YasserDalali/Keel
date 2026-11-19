import { describe, expect, it } from "vitest";

// The dependency rule of the layered architecture, enforced. Source files are read as text (no filesystem needed).
const files = import.meta.glob("../src/contexts/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

type Layer = "domain" | "application" | "infrastructure" | "interface";
const parse = (path: string) => {
  const m = path.match(/contexts\/([^/]+)\/(domain|application|infrastructure|interface)\//);
  return m ? { context: m[1], layer: m[2] as Layer } : null;
};
const importsOf = (src: string): string[] =>
  [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

const all = Object.entries(files).map(([path, src]) => ({ path: path.replace("../src/", ""), src, ...parse(path)!, imports: importsOf(src) })).filter((f) => f.layer);

/** Which context and layer an import points at, or null for libraries and the shared kernel. */
function target(from: string, spec: string) {
  if (!spec.startsWith(".")) return null;
  const resolved = new URL(spec, `file:///${from}`).pathname.slice(1);
  const m = resolved.match(/^src\/contexts\/([^/]+)\/(domain|application|infrastructure|interface)(\/|$)/) ?? resolved.match(/contexts\/([^/]+)\/(domain|application|infrastructure|interface)(\/|$)/);
  return m ? { context: m[1], layer: m[2] as Layer } : null;
}
const offenders = (rule: (f: (typeof all)[number], spec: string) => boolean) =>
  all.flatMap((f) => f.imports.filter((spec) => rule(f, spec)).map((spec) => `${f.path} -> ${spec}`));

describe("architecture", () => {
  it("finds the contexts (so the other checks are not vacuous)", () => {
    expect(all.length).toBeGreaterThan(10);
    expect(new Set(all.map((f) => f.context))).toContain("lending");
  });

  it("domain code depends on nothing but the shared kernel and its own domain", () => {
    expect(
      offenders((f, spec) => {
        if (f.layer !== "domain") return false;
        if (!spec.startsWith(".")) return true; // no libraries at all (no hono, no cloudflare:*, no pdf-lib)
        const t = target(f.path, spec);
        return t !== null && !(t.context === f.context && t.layer === "domain");
      }),
    ).toEqual([]);
  });

  it("domain and application code only reach outside their context through the shared kernel", () => {
    expect(
      offenders((f, spec) => {
        if ((f.layer !== "domain" && f.layer !== "application") || !spec.startsWith(".")) return false;
        const resolved = new URL(spec, `file:///${f.path}`).pathname.slice(1);
        return !/(^|\/)contexts\//.test(resolved) && !/(^|\/)shared(\/|$)/.test(resolved);
      }),
    ).toEqual([]);
  });

  it("domain code never touches the platform", () => {
    const platform = /\b(D1Database|KVNamespace|R2Bucket|fetch\(|crypto\.subtle|Response\b|c\.env)\b/;
    expect(all.filter((f) => f.layer === "domain" && platform.test(f.src)).map((f) => f.path)).toEqual([]);
  });

  it("application code does not depend on infrastructure or the web layer", () => {
    expect(
      offenders((f, spec) => {
        if (f.layer !== "application") return false;
        if (spec === "hono" || spec.startsWith("hono/")) return true;
        const t = target(f.path, spec);
        return t !== null && (t.layer === "infrastructure" || t.layer === "interface");
      }),
    ).toEqual([]);
  });

  it("no context reaches into another context's infrastructure or interface", () => {
    expect(
      offenders((f, spec) => {
        const t = target(f.path, spec);
        return t !== null && t.context !== f.context && (t.layer === "infrastructure" || t.layer === "interface");
      }),
    ).toEqual([]);
  });

  it("interface code goes through use cases, not repositories or SQL", () => {
    expect(
      offenders((f, spec) => {
        if (f.layer !== "interface") return false;
        const t = target(f.path, spec);
        return t !== null && t.layer === "infrastructure";
      }),
    ).toEqual([]);
    expect(all.filter((f) => f.layer === "interface" && /\.prepare\(/.test(f.src)).map((f) => f.path)).toEqual([]);
  });
});
