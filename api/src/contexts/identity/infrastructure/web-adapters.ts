import type { Bindings } from "../../../types";
import type { TokenBlacklist, TokenService, Throttle, VerificationSecrets } from "../application/ports";
import { signJwt } from "./jwt";

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Session tokens: HS256 JWTs valid for an hour. */
export const jwtTokens = (env: Bindings): TokenService => ({
  issue: ({ id, role }) => signJwt({ sub: id, role }, env.JWT_SECRET, 3600),
});

/** Fresh random secret for an email link; only its hash is stored. */
export const verificationSecrets: VerificationSecrets = {
  async create() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return { token, hash: await sha256(token) };
  },
  hash: sha256,
};

export const kvThrottle = (kv: KVNamespace): Throttle => ({
  async acquire(key, seconds) {
    if (await kv.get(key)) return false;
    await kv.put(key, "1", { expirationTtl: seconds });
    return true;
  },
});

export const kvBlacklist = (kv: KVNamespace): TokenBlacklist => ({
  revoke: (jti, ttlSeconds) => kv.put(`blacklist:${jti}`, "1", { expirationTtl: ttlSeconds }),
});
