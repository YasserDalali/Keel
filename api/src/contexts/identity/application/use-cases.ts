import type { Clock } from "../../../shared/clock";
import type { EventBus } from "../../../shared/events";
import type { IdGenerator } from "../../../shared/ids";
import { Email } from "../domain/email";
import { EmailTaken, InvalidCredentials, UserNotFound, VerificationLinkExpired, VerificationLinkInvalid, VerificationThrottled } from "../domain/errors";
import type { IdentityEvent } from "../domain/events";
import type { PasswordHasher, UserRepository, VerificationTokenRepository } from "../domain/repositories";
import { User } from "../domain/user";
import { VerificationToken } from "../domain/verification-token";
import type { Throttle, TokenBlacklist, TokenService, VerificationSecrets } from "./ports";

type Deps = { users: UserRepository; bus: EventBus; clock: Clock; ids: IdGenerator };
type VerificationDeps = { tokens: VerificationTokenRepository; secrets: VerificationSecrets };

/** Issues a fresh verification link and announces it; the Communication context emails it. */
async function requestVerification(d: Deps & VerificationDeps, user: User, baseUrl: string) {
  const { token, hash } = await d.secrets.create();
  await d.tokens.add(VerificationToken.issue(hash, user.id, d.clock.now()));
  const event: IdentityEvent = {
    type: "identity.verification-requested", occurredAt: d.clock.now(), userId: user.id, email: user.email.value, link: `${baseUrl}/verify-email?token=${token}`,
  };
  return event;
}

export class RegisterUser {
  constructor(private d: Deps & VerificationDeps, private hasher: PasswordHasher) {}

  async execute(cmd: { email: unknown; password: string; baseUrl: string }) {
    const email = Email.of(cmd.email);
    if (await this.d.users.byEmail(email)) throw new EmailTaken();

    const user = User.register({ id: this.d.ids.next(), email, passwordHash: await this.hasher.hash(cmd.password) });
    await this.d.users.save(user);

    const documentId = this.d.ids.next();
    const registered: IdentityEvent = { type: "identity.user-registered", occurredAt: this.d.clock.now(), userId: user.id, email: email.value, documentId };
    await this.d.bus.publish([registered, await requestVerification(this.d, user, cmd.baseUrl)]);
    return { id: user.id, email: email.value, documentId };
  }
}

export class Login {
  constructor(private users: UserRepository, private hasher: PasswordHasher, private tokens: TokenService) {}

  async execute(cmd: { email: unknown; password: string }) {
    const user = await this.users.byEmail(Email.of(cmd.email));
    if (!user || !(await this.hasher.verify(cmd.password, user.passwordHash))) throw new InvalidCredentials();
    return { token: await this.tokens.issue(user) };
  }
}

export class Logout {
  constructor(private blacklist: TokenBlacklist, private clock: Clock) {}

  /** Revokes the session token until it would have expired anyway (the store can't hold a TTL under a minute; such tokens expire on their own). */
  async execute(cmd: { jti: string; exp: number }) {
    const ttl = cmd.exp - Math.floor(this.clock.now().getTime() / 1000);
    if (ttl >= 60) await this.blacklist.revoke(cmd.jti, ttl);
  }
}

export class GetAccount {
  constructor(private users: UserRepository) {}

  async execute(q: { userId: string }) {
    const user = await this.users.byId(q.userId);
    if (!user) throw new UserNotFound();
    return { email: user.email.value, emailVerified: user.emailVerified };
  }
}

export class VerifyEmail {
  constructor(private d: Deps & VerificationDeps) {}

  async execute(cmd: { token: unknown }) {
    if (typeof cmd.token !== "string" || !cmd.token || cmd.token.length > 200) throw new VerificationLinkInvalid();
    const userId = await this.d.tokens.consume(await this.d.secrets.hash(cmd.token), this.d.clock.now());
    if (!userId) throw new VerificationLinkExpired();
    const user = await this.d.users.byId(userId);
    if (user) {
      user.verifyEmail(this.d.clock.now());
      await this.d.users.save(user);
    }
  }
}

export class ResendVerification {
  constructor(private d: Deps & VerificationDeps, private throttle: Throttle) {}

  async execute(cmd: { userId: string; baseUrl: string }) {
    const user = await this.d.users.byId(cmd.userId);
    if (!user) throw new UserNotFound();
    if (user.emailVerified) return { alreadyVerified: true as const };
    if (!(await this.throttle.acquire(`verify-resend:${user.id}`, 60))) throw new VerificationThrottled();
    await this.d.bus.publish([await requestVerification(this.d, user, cmd.baseUrl)]);
    return { alreadyVerified: false as const };
  }
}

/** Marks an address verified without a link. Used by the demo shortcut. */
export class MarkEmailVerified {
  constructor(private d: Deps) {}

  async execute(cmd: { userId: string }) {
    const user = await this.d.users.byId(cmd.userId);
    if (!user) return;
    user.verifyEmail(this.d.clock.now());
    await this.d.users.save(user);
  }
}
