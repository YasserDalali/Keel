import { useEffect, useState } from "react";

/** Register the service worker in production only (in dev it would cache stale code). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[pwa] service worker failed", e)));
}

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // we offer our own "Install app" item instead of the browser's mini-bar
  deferred = e as InstallEvent;
  listeners.forEach((l) => l());
});
addEventListener("appinstalled", () => {
  deferred = null;
  listeners.forEach((l) => l());
});

/** `install` is null when the app is already installed or the browser can't prompt. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return deferred
    ? async () => {
        const e = deferred!;
        await e.prompt();
        await e.userChoice;
        deferred = null;
        tick((n) => n + 1);
      }
    : null;
}
