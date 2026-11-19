import {
  GetAccount, Login, Logout, MarkEmailVerified, RegisterUser, ResendVerification, VerifyEmail,
} from "../../contexts/identity/application/use-cases";
import { D1UserRepository } from "../../contexts/identity/infrastructure/d1-user-repository";
import { D1VerificationTokens } from "../../contexts/identity/infrastructure/d1-verification-tokens";
import { pbkdf2Hasher } from "../../contexts/identity/infrastructure/pbkdf2-hasher";
import { jwtTokens, kvBlacklist, kvThrottle, verificationSecrets } from "../../contexts/identity/infrastructure/web-adapters";
import type { Wiring } from "./shared";

export function wireIdentity({ env, bus, clock, ids }: Wiring) {
  const users = new D1UserRepository(env.DB);
  const tokens = new D1VerificationTokens(env.DB);
  const deps = { users, bus, clock, ids };
  const withTokens = { ...deps, tokens, secrets: verificationSecrets };
  const sessions = jwtTokens(env);

  return {
    register: new RegisterUser(withTokens, pbkdf2Hasher),
    login: new Login(users, pbkdf2Hasher, sessions),
    logout: new Logout(kvBlacklist(env.LOAN_CACHE), clock),
    account: new GetAccount(users),
    verifyEmail: new VerifyEmail(withTokens),
    resendVerification: new ResendVerification(withTokens, kvThrottle(env.LOAN_CACHE)),
    markEmailVerified: new MarkEmailVerified(deps),
  };
}
export type IdentityServices = ReturnType<typeof wireIdentity>;
