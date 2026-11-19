import { useCallback, useEffect, useState } from "react";
import createClient from "openapi-fetch";
import type { paths } from "./api-types";

export const TOKEN_KEY = "token";
export const api = createClient<paths>({ baseUrl: "/api" });

api.use({
  onRequest({ request }) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** For endpoints openapi.json doesn't describe. Throws ApiError with the server's message. */
export async function http<T>(path: string, init: Omit<RequestInit, "body"> & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) });
  } catch {
    throw new ApiError("We couldn't reach Keel. Check your connection and try again.", 0);
  }
  const body = res.headers.get("Content-Type")?.includes("json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new ApiError(body.error ?? body.detail ?? `Something went wrong (${res.status}). Try again.`, res.status, body.code);
  return body as T;
}

/** Load once per key; `reload()` refetches without blanking what's on screen. */
export function useLoad<T>(load: () => Promise<T>, key: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return load().then(
      (data) => setState({ data, loading: false }),
      (e: Error) => setState((s) => ({ ...s, error: e.message, loading: false })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
