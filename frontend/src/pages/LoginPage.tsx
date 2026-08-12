import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../App";
import Field from "../components/ui/Field";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";

const turnstileToken = import.meta.env.VITE_TURNSTILE_TOKEN || "1x00000000000000000000AA";
if (!turnstileToken) {
  throw new Error("VITE_TURNSTILE_TOKEN is required in the repo-root .env file");
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "register") {
      const { error: err } = await api.POST("/auth/register", {
        body: { email, password, turnstileToken },
      });
      if (err) {
        setError("error" in err ? err.error : "Registration failed");
        return;
      }
    }

    const { data, error: err } = await api.POST("/auth/login", {
      body: { email, password, turnstileToken },
    });
    if (err || !data) {
      setError("error" in (err ?? {}) ? (err as { error: string }).error : "Login failed");
      return;
    }

    const me = await login(data.token);
    if (!me) return;
    if (me.role === "officer" || me.role === "admin") {
      navigate("/officer");
    } else if (!localStorage.getItem("onboarding_shown")) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center border-b border-ink p-8 md:border-b-0 md:border-r">
        <p className="font-mono text-xs uppercase tracking-wide2 text-ink/60">
          MCL / 01 // ACCESS TERMINAL
        </p>
        <h1 className="font-display uppercase leading-[0.9] tracking-tightest text-[clamp(3rem,9vw,7rem)]">
          Micro
          <br />
          Loans<span className="text-hazard">®</span>
        </h1>
      </div>

      <div className="flex items-center justify-center p-8">
        <Panel title={mode === "login" ? "Login" : "Register"} className="w-full max-w-sm">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field label="Email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {error && (
              <p className="border border-hazard bg-paper px-3 py-2 font-mono text-xs text-hazard">
                {error}
              </p>
            )}
            <Button type="submit">{mode === "login" ? "Login" : "Register"}</Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError("");
            }}
            className="mt-4 font-mono text-xs uppercase tracking-wide2 underline"
          >
            {mode === "login" ? "No account? Register" : "Have an account? Login"}
          </button>
        </Panel>
      </div>
    </div>
  );
}
