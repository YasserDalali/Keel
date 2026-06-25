import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { extractOcr } from "../kyc/ocr";
import { createProfile } from "../profiles";
import type { Bindings, Variables } from "../types";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const DRAFT_TTL_SECONDS = 3600;

const kyc = new Hono<{ Bindings: Bindings; Variables: Variables }>();

kyc.post("/upload", requireAuth, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return c.json({ error: "Missing file" }, 400);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: "Unsupported file type; use image/jpeg or image/png" }, 415);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large; max 5 MB" }, 400);
  }

  const userId = c.var.userId;
  const r2Key = `kyc/${userId}/${crypto.randomUUID()}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  await c.env.KYC_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  let suggestions;
  try {
    suggestions = await extractOcr(bytes, file.type, c.env.GEMINI_API_KEY);
  } catch {
    return c.json({ error: "OCR processing failed" }, 502);
  }

  await c.env.LOAN_CACHE.put(
    `kyc:draft:${userId}`,
    JSON.stringify({ r2Key, ocr: suggestions }),
    { expirationTtl: DRAFT_TTL_SECONDS }
  );

  return c.json({ suggestions, r2Key });
});

kyc.post("/confirm", requireAuth, async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    firstName: string;
    lastName: string;
    nationalIdNumber: string;
    phone: string;
    address: string;
  }>();

  const draftRaw = await c.env.LOAN_CACHE.get(`kyc:draft:${userId}`);
  if (!draftRaw) {
    return c.json({ error: "No pending KYC upload" }, 400);
  }
  const draft = JSON.parse(draftRaw) as { r2Key: string; ocr: unknown };

  const existing = await c.env.DB.prepare("SELECT user_id FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (existing) {
    return c.json({ error: "Profile already exists" }, 409);
  }

  await createProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId,
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    address: body.address,
    nationalIdNumber: body.nationalIdNumber,
    kycDocumentR2Key: draft.r2Key,
    ocrExtractedData: JSON.stringify(draft.ocr),
  });

  await c.env.LOAN_CACHE.delete(`kyc:draft:${userId}`);

  return c.json({ userId, kycStatus: "pending" }, 201);
});

export default kyc;
