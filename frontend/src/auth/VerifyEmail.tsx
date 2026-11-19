import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { http } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../ui/Button";
import { Plain } from "./Plain";
import { ResendButton } from "../app/EmailBanner";

/** Target of the link in the verification email: /verify-email?token=… */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"verifying" | "verified" | "failed">("verifying");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // a token is single-use; don't spend it twice under StrictMode
    ran.current = true;
    const token = params.get("token");
    if (!token) return setState("failed");
    http("/auth/verify-email", { method: "POST", json: { token } }).then(
      () => {
        setState("verified");
        refresh().catch(() => {});
      },
      () => setState("failed"),
    );
  }, [params, refresh]);

  return (
    <Plain>
      {state === "verifying" && <h1 className="text-h2">Confirming your email…</h1>}
      {state === "verified" && (
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-h1">Email confirmed</h1>
          <p className="text-body text-ink-2">Thanks. You can apply for a loan whenever you're ready.</p>
          <Button to={user ? "/app" : "/signin"} size="lg">{user ? "Go to your account" : "Sign in"}</Button>
        </div>
      )}
      {state === "failed" && (
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-h1">That link didn't work</h1>
          <p className="text-body text-ink-2">
            It may have expired or already been used. {user ? "Send yourself a new one." : "Sign in to send a new one."}
          </p>
          {user ? <ResendButton size="lg" /> : <Button to="/signin" size="lg">Sign in</Button>}
        </div>
      )}
    </Plain>
  );
}
