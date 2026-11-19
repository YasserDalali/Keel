import type { PasswordHasher } from "../domain/repositories";
import { hashPassword, verifyPassword } from "./password";

export const pbkdf2Hasher: PasswordHasher = { hash: hashPassword, verify: verifyPassword };
