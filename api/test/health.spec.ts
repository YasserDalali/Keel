import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /api/health", () => {
  it("returns ok status and confirms DB connectivity", async () => {
    const res = await app.request("/api/health", {}, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: "connected" });
  });
});
