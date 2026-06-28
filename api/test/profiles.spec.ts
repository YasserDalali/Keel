import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createProfile, getProfile, upsertVerificationStatus } from "../src/profiles";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

describe("createProfile / getProfile", () => {
  it("stores PII as ciphertext and returns decrypted plaintext on read", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "profile-test@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
    });

    const raw = await env.DB.prepare(
      "SELECT first_name, phone FROM profiles WHERE user_id = ?"
    ).bind(userId).first<{ first_name: string; phone: string }>();
    expect(raw?.first_name).not.toBe("Jane");
    expect(raw?.phone).not.toBe("+15551234567");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.firstName).toBe("Jane");
    expect(profile?.phone).toBe("+15551234567");
    expect(profile?.kycStatus).toBe("pending");
    expect(profile?.diditSessionId).toBeNull();
  });

  it("returns null for a user with no profile", async () => {
    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, crypto.randomUUID());
    expect(profile).toBeNull();
  });
});

describe("upsertVerificationStatus", () => {
  it("creates a profile row if none exists", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "upsert-new@example.com");

    await upsertVerificationStatus(env.DB, userId, "approved", "sess-123");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.kycStatus).toBe("approved");
    expect(profile?.diditSessionId).toBe("sess-123");
  });

  it("updates status on existing profile without overwriting PII", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "upsert-existing@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId, firstName: "Jane", lastName: "Doe",
      phone: "+15551234567", address: "123 Main", nationalIdNumber: "A1234567",
    });

    await upsertVerificationStatus(env.DB, userId, "declined", "sess-456");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.kycStatus).toBe("declined");
    expect(profile?.diditSessionId).toBe("sess-456");
    expect(profile?.firstName).toBe("Jane");
  });
});
