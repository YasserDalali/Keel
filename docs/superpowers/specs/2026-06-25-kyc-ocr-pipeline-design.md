# KYC / OCR Pipeline — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan
**Source requirements:** CLOUDFLARE_MICROLOAN_PLAN.md §4.A (Zero-Trust Registration & KYC with Workers AI OCR), §6 Phase 3.1 (`/api/kyc/upload`), §3 `profiles` schema.

## Goal

A logged-in borrower uploads a National ID image. The **Gemini API** (`gemini-2.5-flash`, multimodal) performs OCR + field extraction in one free-tier call to pre-fill name / national ID number / date of birth. The borrower confirms or edits the suggested values and submits, which creates their **encrypted** profile flagged `kyc_status = 'pending'` for later officer review.

> **OCR engine note (changed 2026-06-25):** the original design used Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`). It was swapped for the Gemini API to avoid any Cloudflare AI (neuron) cost — Gemini's free tier covers this and `gemini-2.5-flash` is itself multimodal, so no separate open-source OCR engine (e.g. Tesseract) is needed. `extractOcr` now takes `(image, mimeType, apiKey)` and calls Gemini over `fetch`; the `AI` binding is removed. The two-step flow, R2/KV/D1 storage, encryption, and parser contract are unchanged.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| OCR ↔ profile relationship | **OCR pre-fills, borrower confirms** (two-step) | Best UX; OCR is advisory, the borrower owns the final values, officer still reviews. |
| Upload transport | **multipart/form-data** | Idiomatic for Workers; streams to R2; easy to curl-test. |
| AI testability | **Abstract OCR behind `extractOcr`; inject a fake `env.AI` in tests; one real-AI smoke test** | Vision output is non-deterministic and costs neurons; deterministic tests + a single real smoke test mirrors how Turnstile/D1 are handled. |
| `ocr_extracted_data` at rest | **Encrypted (AES-GCM via existing `encryptField`)** | The OCR JSON contains real PII (name, ID, DOB); leaving it plaintext would break the "a D1 dump yields only ciphertext" guarantee. Corrects the pii-encryption plan's note that this column is non-PII. |
| Turnstile on KYC | **requireAuth only, no Turnstile** | Bot gate already happened at register/login; an authenticated borrower uploading their own ID does not need a second CAPTCHA. |
| Plan scope | **Borrower pipeline only** | Officer approve/reject and signed R2 document preview defer to the `admin-and-zero-trust` plan, where the officer/admin dashboard lives. |

## Architecture — two-step, borrower-facing

```
1. POST /api/kyc/upload   (requireAuth; multipart/form-data, field: file = <id image>)
     ├─ validate content-type (image/jpeg | image/png) + size (≤ 5 MB)   → 415 / 400 on fail
     ├─ stream image → R2   key = kyc/{userId}/{uuid}                    (private bucket KYC_BUCKET)
     ├─ extractOcr(bytes, c.env.AI) → { firstName, lastName, nationalIdNumber, dob }
     │     model @cf/meta/llama-3.2-11b-vision-instruct; parse model text → fields (nulls if unparseable)
     ├─ stash KV draft   kyc:draft:{userId} = { r2Key, ocr }   TTL 3600 s
     └─ 200 { suggestions: { firstName, lastName, nationalIdNumber, dob }, r2Key }

2. POST /api/kyc/confirm  (requireAuth; JSON: { firstName, lastName, nationalIdNumber, phone, address })
     ├─ read KV draft (r2Key + raw ocr)                                  → 400 if missing/expired
     ├─ 409 if a profile already exists for this user (one KYC per user)
     ├─ createProfile(...) — AES-GCM encrypts PII + ocr_extracted_data,
     │                       sets kyc_document_r2_key, kyc_status defaults 'pending'
     ├─ delete KV draft
     └─ 201 { userId, kycStatus: "pending" }
```

**Why two endpoints + a KV draft:** the `profiles` row cannot be created at upload time — its PII columns are `NOT NULL` and `phone` / `address` do not appear on an ID card, so they must come from the borrower at confirm time. The R2 object key and raw OCR result live in a short-lived KV draft (`kyc:draft:{userId}`, TTL 3600 s) between the two steps. KV's minimum `expirationTtl` is 60 s, so 3600 s is valid.

## Components / files

```
microloans/
├── api/
│   ├── src/
│   │   ├── index.ts                 # MODIFIED: mount /api/kyc
│   │   ├── kyc/
│   │   │   └── ocr.ts               # NEW: extractOcr(image, ai) → OcrResult
│   │   ├── routes/
│   │   │   └── kyc.ts               # NEW: POST /upload, POST /confirm
│   │   └── profiles.ts              # MODIFIED: createProfile/getProfile gain
│   │                                #   kyc_document_r2_key + encrypted ocr_extracted_data
│   └── test/
│       ├── ocr.spec.ts              # NEW: parser unit tests (fake AI)
│       └── kyc.spec.ts              # NEW: integration (fake AI via env override)
```

- **`api/src/kyc/ocr.ts`** — `extractOcr(image: ArrayBuffer | Uint8Array, ai: Ai): Promise<OcrResult>` where `OcrResult = { firstName: string | null; lastName: string | null; nationalIdNumber: string | null; dob: string | null }`. Builds the vision prompt, calls `@cf/meta/llama-3.2-11b-vision-instruct`, and parses the model's text output into structured fields (tolerant of clean JSON, JSON embedded in prose, and garbage → nulls). This is the deterministic seam: integration tests pass a fake `env.AI` whose `run()` returns canned output; the real model is only exercised by the smoke test.
- **`api/src/routes/kyc.ts`** — the two `requireAuth`-gated routes, mounted at `/api/kyc` in `index.ts`.
- **`api/src/profiles.ts`** (extend) — `ProfileInput` / `createProfile` gain `kycDocumentR2Key: string` and `ocrExtractedData: string` (the raw OCR JSON); the OCR JSON is encrypted via the existing `encryptField` before the `INSERT`. `getProfile` / `ProfileRecord` decrypt and expose it. `createProfile` has no live caller yet (built in the pii-encryption plan for exactly this consumer), so extending its signature is safe.

## Data flow & storage

- **R2** (`KYC_BUCKET`, private bucket `microloans-kyc`): one object per upload, key `kyc/{userId}/{uuid}`, original content-type preserved. Write-only in this plan; officer retrieval (signed/proxied access) is deferred.
- **KV** (`LOAN_CACHE`): ephemeral draft `kyc:draft:{userId}` → `{ r2Key, ocr }`, TTL 3600 s, deleted on successful confirm.
- **D1** (`profiles`): on confirm, a single encrypted row — PII fields and `ocr_extracted_data` AES-GCM-encrypted, `kyc_document_r2_key` stored as the plaintext R2 pointer, `kyc_status` defaulting to `'pending'`.

## Error handling

| Condition | Response |
| :--- | :--- |
| Missing file / wrong content-type / > 5 MB | 415 or 400, before any R2 or AI cost |
| Vision model call throws | 502 (image already safely in R2) |
| Model returns but fields unparseable | 200 with `null` fields — borrower types them manually; raw model text still stored in the draft |
| `confirm` with no draft (never uploaded / expired) | 400 "no pending KYC upload" |
| `confirm` when a profile already exists | 409 (one KYC per user for now) |

## Testing strategy

Matches the established project pattern (real Cloudflare bindings via `@cloudflare/vitest-pool-workers`, no behavioral mocks) — with the single exception that the **non-deterministic, neuron-costing** vision model is faked in automated tests and verified once for real in a smoke test.

- **`ocr.spec.ts`** — unit tests for `extractOcr`'s parser using a fake `ai` whose `run()` returns: clean JSON, JSON embedded in prose, and unparseable garbage (→ all-null result).
- **`kyc.spec.ts`** — integration via `app.request(req, { ...env, AI: fakeAi })`:
  - upload: 200 with suggestions, KV draft written, R2 object present;
  - confirm: 201, profile row created, **raw `first_name` and `ocr_extracted_data` columns are ciphertext** (not plaintext), `kyc_status='pending'`, KV draft deleted;
  - confirm with no draft → 400; duplicate profile → 409;
  - upload rejects a non-image / oversized body → 415/400.
- **Smoke test** (`wrangler dev --local`, manual/verification task): upload a real ID image → real `@cf/meta/llama-3.2-11b-vision-instruct` → assert 200 and the response **shape** (suggestion keys present), not exact extracted values.

## Out of scope / deferred

- **DOB storage:** no `profiles` column exists; DOB lives only inside the (encrypted) `ocr_extracted_data` JSON and the upload response. No schema migration until a feature consumes DOB (YAGNI).
- **Officer review:** approve/reject (`kyc_status` → `approved`/`rejected`) and signed R2 document preview → `admin-and-zero-trust` plan.
- **Re-submission after rejection:** one profile per user for now; re-KYC flow deferred.
- **Liveness / face-match / document-authenticity checks:** out of scope; OCR field extraction only.
