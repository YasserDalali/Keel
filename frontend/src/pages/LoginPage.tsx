import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../App";

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

    await login(data.token);
    navigate("/dashboard");
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="flex flex-col gap-4 w-80">
        <h1 className="text-xl font-semibold">
          {mode === "login" ? "Login" : "Create account"}
        </h1>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit">
            {mode === "login" ? "Login" : "Register"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError("");
          }}
          className="text-sm underline"
        >
          {mode === "login" ? "No account? Register" : "Have an account? Login"}
        </button>
      </div>
    </div>
  );
}
