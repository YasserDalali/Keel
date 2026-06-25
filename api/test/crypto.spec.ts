import { describe, expect, it } from "vitest";
import { encryptField, decryptField } from "../src/crypto";

function randomBase64Key(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw));
}

describe("encryptField / decryptField", () => {
  it("round-trips plaintext through encryption and decryption", async () => {
    const key = randomBase64Key();
    const blob = await encryptField("Jane Doe", key);
    const plaintext = await decryptField(blob, key);

    expect(plaintext).toBe("Jane Doe");
  });

  it("produces different ciphertext for the same plaintext each call", async () => {
    const key = randomBase64Key();
    const blobA = await encryptField("Jane Doe", key);
    const blobB = await encryptField("Jane Doe", key);

    expect(blobA).not.toEqual(blobB);
  });

  it("fails to decrypt with the wrong key", async () => {
    const blob = await encryptField("Jane Doe", randomBase64Key());
    await expect(decryptField(blob, randomBase64Key())).rejects.toThrow();
  });
});
