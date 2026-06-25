import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

describe("POST /api/auth/register", () => {
  it("creates a new borrower and returns 201", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new-borrower@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new-borrower@example.com");
    expect(typeof body.id).toBe("string");
  });

  it("rejects a duplicate email with 409", async () => {
    const payload = {
      email: "duplicate@example.com",
      password: "correct-horse-battery-staple",
      turnstileToken: DUMMY_TOKEN,
    };
    await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      env
    );
    const second = await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      env
    );

    expect(second.status).toBe(409);
  });
});
