/** API root including `/api`. Defaults to same-origin `/api` (Vite proxy in dev). */
export const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api";

/** Build a full API URL from a path with or without the `/api` prefix. */
export function apiUrl(path: string): string {
  const suffix = path.replace(/^\/api/, "");
  return `${apiBaseUrl}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
