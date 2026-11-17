import { describe, expect, it } from "vitest";
import { AuthError } from "../lib/auth-error";
import { authMessage } from "./authErrors";

describe("authMessage", () => {
  it("points a wrong password at the password field", () => {
    expect(authMessage(new AuthError(401))).toEqual({
      field: "password",
      text: "That email and password don't match. Check both and try again.",
    });
  });
  it("offers sign in when the email is taken", () => {
    expect(authMessage(new AuthError(409))).toEqual({
      field: "email",
      text: "There's already an account with this email.",
      action: { label: "Sign in instead", to: "/signin" },
    });
  });
  it("explains a network failure", () => {
    expect(authMessage(new TypeError("Failed to fetch")).text).toBe(
      "We couldn't reach Keel. Check your connection and try again.",
    );
  });
  it("falls back for anything else", () => {
    expect(authMessage(new AuthError(500)).text).toBe("Something went wrong on our side. Try again in a minute.");
  });
});
