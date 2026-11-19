import type { Email } from "./email";
import type { User } from "./user";
import type { VerificationToken } from "./verification-token";

export interface UserRepository {
  byId(id: string): Promise<User | null>;
  byEmail(email: Email): Promise<User | null>;
  /** Stores a new user, or the changes to a loaded one. */
  save(user: User): Promise<void>;
}

export interface VerificationTokenRepository {
  add(token: VerificationToken): Promise<void>;
  /** Uses the token if it exists, is unused and unexpired at `now`; returns whose it was. Atomic: a token works once. */
  consume(hash: string, now: Date): Promise<string | null>;
}

/** One-way password hashing, so the domain can create and check credentials without knowing the algorithm. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}
