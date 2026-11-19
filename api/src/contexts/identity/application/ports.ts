import type { Role } from "../domain/user";

/** Outbound ports: what identity needs from the outside world, in its own words. */
export interface TokenService {
  issue(user: { id: string; role: Role }): Promise<string>;
}
/** Single-use secrets for email links. Only the hash is stored. */
export interface VerificationSecrets {
  create(): Promise<{ token: string; hash: string }>;
  hash(token: string): Promise<string>;
}
/** "Only once per N seconds per key". Returns false when the key is still held. */
export interface Throttle {
  acquire(key: string, seconds: number): Promise<boolean>;
}
export interface TokenBlacklist {
  revoke(jti: string, ttlSeconds: number): Promise<void>;
}
