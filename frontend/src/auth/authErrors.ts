import { AuthError } from "../lib/auth-error";

export type AuthMessage = {
  field?: "email" | "password";
  text: string;
  action?: { label: string; to: string };
};

export function authMessage(err: unknown): AuthMessage {
  if (err instanceof AuthError && err.status === 401)
    return { field: "password", text: "That email and password don't match. Check both and try again." };
  if (err instanceof AuthError && err.status === 409)
    return {
      field: "email",
      text: "There's already an account with this email.",
      action: { label: "Sign in instead", to: "/signin" },
    };
  if (err instanceof TypeError) return { text: "We couldn't reach Keel. Check your connection and try again." };
  return { text: "Something went wrong on our side. Try again in a minute." };
}
