const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const outcome = await res.json<{ success: boolean }>();
    return outcome.success;
  } catch {
    return false; // ponytail: fail-closed on transport/parse errors
  }
}
