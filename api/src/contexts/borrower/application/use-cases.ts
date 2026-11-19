import { toSqlTimestamp, type Clock } from "../../../shared/clock";
import { BankLink } from "../domain/bank-link";
import { BankLinkFailed, ProfileNotFound, VerificationUnreachable } from "../domain/errors";
import { PersonalDetails } from "../domain/personal-details";
import { Profile, type KycStatus } from "../domain/profile";
import type { BankLinkRepository, ProfileRepository } from "../domain/repositories";
import type { BankLinkProvider, EventDeduplicator, VerificationProvider } from "./ports";

/** What a profile looks like to clients: the stored details, readable, plus where the identity check stands. */
const record = (p: Profile) => ({ userId: p.userId, ...p.details, kycStatus: p.kycStatus, diditSessionId: p.verificationSessionId });

export class GetOwnProfile {
  constructor(private profiles: ProfileRepository, private banks: BankLinkRepository) {}

  async execute(q: { userId: string }) {
    const [profile, bank] = await Promise.all([this.profiles.byUserId(q.userId), this.banks.summaryOf(q.userId)]);
    return {
      profile: profile ? record(profile) : null,
      kycStatus: profile?.kycStatus ?? null,
      bankConnected: bank !== null,
      bankSafetyScore: bank?.safetyScore ?? null,
      bank: bank ? { institutionName: bank.institutionName, safetyScore: bank.safetyScore, connectedAt: bank.connectedAt } : null,
      kycUpdatedAt: profile?.kycUpdatedAt ? toSqlTimestamp(profile.kycUpdatedAt) : null,
    };
  }
}

/** For officers reviewing an application. */
export class GetProfileForStaff {
  constructor(private profiles: ProfileRepository) {}

  async execute(q: { userId: string }) {
    const profile = await this.profiles.byUserId(q.userId);
    if (!profile) throw new ProfileNotFound();
    return { profile: record(profile) };
  }
}

export class SaveProfileDetails {
  constructor(private profiles: ProfileRepository) {}

  async execute(cmd: { userId: string; details: Parameters<typeof PersonalDetails.of>[0] }) {
    const details = PersonalDetails.of(cmd.details);
    const profile = await this.profiles.byUserId(cmd.userId);
    if (profile) {
      profile.updateDetails(details);
      await this.profiles.save(profile);
    } else {
      await this.profiles.save(Profile.startWithDetails(cmd.userId, details));
    }
  }
}

export class StartIdentityVerification {
  constructor(private profiles: ProfileRepository, private provider: VerificationProvider, private clock: Clock) {}

  async execute(cmd: { userId: string }) {
    const session = await this.provider.openSession(cmd.userId);
    const profile = (await this.profiles.byUserId(cmd.userId)) ?? Profile.startWithVerification(cmd.userId, this.clock.now());
    profile.beginVerification(session.sessionId, session.status ?? "pending");
    await this.profiles.save(profile);
    return { url: session.url, session_id: session.sessionId };
  }
}

/** Asks the provider for the latest result. Works without its webhook, which can't reach a local server. */
export class RefreshIdentityVerification {
  constructor(private profiles: ProfileRepository, private provider: VerificationProvider, private clock: Clock) {}

  async execute(cmd: { userId: string }): Promise<{ kycStatus: KycStatus | null }> {
    const profile = await this.profiles.byUserId(cmd.userId);
    if (!profile?.verificationSessionId) return { kycStatus: profile?.kycStatus ?? null };

    const decision = await this.provider.decisionOf(profile.verificationSessionId);
    if (!decision) throw new VerificationUnreachable(profile.kycStatus);
    if (profile.identityVerified) return { kycStatus: "approved" }; // never downgrade a verified identity

    if (decision.status && profile.recordDecision({ status: decision.status, sessionId: profile.verificationSessionId, source: "refresh", at: this.clock.now() })) {
      await this.profiles.save(profile);
    }
    return { kycStatus: decision.status ?? profile.kycStatus };
  }
}

export type WebhookOutcome = "ok" | "stale" | "invalid_json" | "bad_signature";

/** The provider tells us how someone's verification went. Authentic, fresh, and processed once per event id. */
export class ApplyVerificationWebhook {
  constructor(private profiles: ProfileRepository, private provider: VerificationProvider, private dedupe: EventDeduplicator, private clock: Clock) {}

  async execute(cmd: { rawBody: string; signature: string; timestamp: string | undefined }): Promise<WebhookOutcome> {
    const hook = await this.provider.readWebhook(cmd.rawBody, cmd.signature, cmd.timestamp);
    if (hook.kind !== "event") return hook.kind;
    if (hook.eventId && !(await this.dedupe.firstTime(hook.eventId))) return "ok";

    if (hook.type === "status.updated" && hook.userId && hook.sessionId && hook.status) {
      const at = this.clock.now();
      const profile = (await this.profiles.byUserId(hook.userId)) ?? Profile.startWithVerification(hook.userId, at);
      profile.recordDecision({ status: hook.status, sessionId: hook.sessionId, source: "provider", at });
      await this.profiles.save(profile);
    }
    return "ok";
  }
}

export class CreateBankLinkToken {
  constructor(private provider: BankLinkProvider) {}

  async execute(cmd: { userId: string }) {
    try {
      return { linkToken: await this.provider.createLinkToken(cmd.userId) };
    } catch (e) {
      throw new BankLinkFailed("bank_link_token_failed", `Failed to create link token: ${(e as Error).message}`);
    }
  }
}

export class ConnectBank {
  constructor(private banks: BankLinkRepository, private provider: BankLinkProvider) {}

  async execute(cmd: { userId: string; publicToken: string }) {
    let link: BankLink;
    try {
      const c = await this.provider.connect(cmd.publicToken);
      link = BankLink.connect({ userId: cmd.userId, itemId: c.itemId, accessToken: c.accessToken, institutionName: c.institutionName, accounts: c.accounts });
    } catch (e) {
      throw new BankLinkFailed("bank_connect_failed", `Bank connection failed: ${(e as Error).message}`);
    }
    await this.banks.save(link);
    return { bankSafetyScore: link.safetyScore, signals: JSON.parse(link.signals) as Record<string, unknown> };
  }
}

/** Answers lending's one question about a borrower: is their identity verified, and how safe does their bank look? */
export class GetBorrowerStanding {
  constructor(private profiles: ProfileRepository, private banks: BankLinkRepository) {}

  async execute(q: { userId: string }) {
    const [kycStatus, bank] = await Promise.all([this.profiles.kycStatusOf(q.userId), this.banks.summaryOf(q.userId)]);
    return { kycStatus: kycStatus ?? "pending", bankSafetyScore: bank ? bank.safetyScore : null };
  }
}

// ── Demo shortcuts (used by the demo adapter, never by real flows) ───────────

/** Pretends the borrower's bank was connected, with a fixed good score. */
export class CompleteBankLink {
  constructor(private banks: BankLinkRepository) {}
  execute(cmd: { userId: string }) {
    return this.banks.save(
      BankLink.record({ userId: cmd.userId, itemId: `demo-${cmd.userId}`, accessToken: "demo-access-token", institutionName: "Demo Bank", safetyScore: 80, signals: JSON.stringify({ demo: true }) }),
    );
  }
}

/** Pretends the identity check passed. */
export class ApproveIdentity {
  constructor(private profiles: ProfileRepository, private clock: Clock) {}
  async execute(cmd: { userId: string }) {
    const at = this.clock.now();
    const profile = (await this.profiles.byUserId(cmd.userId)) ?? Profile.startWithVerification(cmd.userId, at);
    profile.recordDecision({ status: "approved", sessionId: null, source: "provider", at });
    await this.profiles.save(profile);
  }
}
