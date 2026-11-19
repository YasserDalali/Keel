/** Only same-site paths, so a crafted `next` can't bounce the user to another origin ("//x", "/\x" are protocol-relative). */
export const safeNext = (next: string | null) => (next && /^\/(?![/\\])/.test(next) ? next : "/app");
