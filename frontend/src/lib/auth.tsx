import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import { api, TOKEN_KEY } from "./api";
import type { components } from "./api-types";
import { AuthError } from "./auth-error";

type Me = components["schemas"]["Me"];
// ponytail: static token (always-pass in dev); only accepted while TURNSTILE_SECRET is Cloudflare's test secret. Phase 2 renders the real widget.
const TURNSTILE_TOKEN = import.meta.env.VITE_TURNSTILE_TOKEN ?? "XXXX.DUMMY.TOKEN.XXXX";

type Auth = {
  user: Me | null;
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  async function loadMe() {
    const { data } = await api.GET("/auth/me");
    if (!data) localStorage.removeItem(TOKEN_KEY); // expired or revoked
    setUser(data ?? null);
  }

  useEffect(() => {
    (localStorage.getItem(TOKEN_KEY) ? loadMe().catch(() => setUser(null)) : Promise.resolve()).finally(() => setReady(true));
  }, []);

  async function signIn(email: string, password: string) {
    const { data, response } = await api.POST("/auth/login", { body: { email, password, turnstileToken: TURNSTILE_TOKEN } });
    if (!data) throw new AuthError(response.status);
    localStorage.setItem(TOKEN_KEY, data.token);
    await loadMe();
  }

  async function signUp(email: string, password: string) {
    const { response } = await api.POST("/auth/register", { body: { email, password, turnstileToken: TURNSTILE_TOKEN } });
    if (!response.ok) throw new AuthError(response.status);
    await signIn(email, password);
  }

  async function signOut() {
    await api.POST("/auth/logout").catch(() => {}); // token is dropped locally either way
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, ready, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Outlet /> : <Navigate to="/signin" replace />;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/app" replace /> : children;
}
