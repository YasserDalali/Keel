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

describe("POST /api/auth/login", () => {
  it("returns a JWT for correct credentials", async () => {
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login-test@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login-test@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(3);
  });

  it("returns 401 for wrong password", async () => {
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong-pw@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong-pw@example.com",
          password: "totally-wrong",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(401);
  });
});
