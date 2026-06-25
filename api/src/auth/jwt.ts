export type JwtPayload = {
  sub: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};

function base64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(String.fromCharCode(...new Uint8Array(signature)));
}

export async function signJwt(
  payload: { sub: string; role: JwtPayload["role"] },
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const fullPayload: JwtPayload = {
    ...payload,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(fullPayload))}`;
  const signature = await hmacSign(data, secret);
  return `${data}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed token");
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature !== expectedSignature) {
    throw new Error("Invalid signature");
  }
  const payload: JwtPayload = JSON.parse(base64urlDecode(encodedPayload));
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return payload;
}
