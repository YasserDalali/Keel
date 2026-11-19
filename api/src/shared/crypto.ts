const IV_LENGTH_BYTES = 12;

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToUint8Array(base64Key);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptField(plaintext: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${arrayBufferToBase64(iv)}:${arrayBufferToBase64(ciphertext)}`;
}

export async function decryptField(blob: string, base64Key: string): Promise<string> {
  const [ivB64, ciphertextB64] = blob.split(":");
  const key = await importAesKey(base64Key);
  const iv = base64ToUint8Array(ivB64);
  const ciphertext = base64ToUint8Array(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
