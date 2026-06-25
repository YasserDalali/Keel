# Architectural Plan: Cloudflare-Native Micro-Loan Platform

This document outlines the complete architectural design and implementation plan for a secure, low-latency, and highly scalable micro-loan platform built entirely on **Cloudflare's Serverless Native Ecosystem**, leveraging their generous **Free Tier services**.

---

## 1. Architectural Blueprint

By building natively on Cloudflare, we bypass traditional server maintenance, minimize cold starts, distribute our application globally to the edge, and enforce enterprise-grade security at zero infrastructure cost.

### High-Level System Architecture

```
                    ┌────────────────────────┐
                    │     Borrower / Web     │
                    │   (React SPA / Pages)  │
                    └───────────┬────────────┘
                                │ (HTTPS + Turnstile CAPTCHA)
                                ▼
                    ┌────────────────────────┐
                    │    Cloudflare WAF      │
                    │   & Rate Limiting      │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐         ┌─────────────────────────┐
                    │    Cloudflare Pages    │◄───────►│  Cloudflare Zero Trust  │
                    │   Functions / Worker   │         │ (Admin SSO Authentication)
                    └─────┬───┬───┬───┬──────┘         └─────────────────────────┘
                          │   │   │   │
        ┌─────────────────┘   │   │   └───────────────────┐
        ▼                     ▼   ▼                       ▼
 ┌─────────────┐       ┌─────────────┐             ┌─────────────┐
 │  Cloudflare │       │  Cloudflare │             │  Cloudflare │
 │     D1      │       │     KV      │             │     R2      │
 │ (SQL DB)    │       │ (Cache/Auth)│             │ (S3 Storage)│
 └─────────────┘       └─────────────┘             └─────────────┘
        ▲                                                 ▲
        │                                                 │
        └───────────────┐                 ┌───────────────┘
                        ▼                 ▼
                 ┌──────────────────────────┐
                 │    Cloudflare AI         │
                 │ (OCR & Credit Risk LLM)  │
                 └──────────────────────────┘
```

---

## 2. Cloudflare Free Services Mapping

Cloudflare provides a comprehensive set of building blocks. Below is how each free-tier service is mapped to solve the critical business and engineering requirements of a micro-loan platform:

| Cloudflare Service | Role in Micro-Loan Platform | Free Tier Limits (Included) |
| :--- | :--- | :--- |
| **Cloudflare Pages** | Hosts the borrower frontend (React / Vite) and admin dashboard. Deployments are fast and distributed worldwide. | Unlimited bandwidth, unlimited sites, 500 builds/month. |
| **Cloudflare Workers** | Hosts the microservices and RESTful API endpoints (e.g., `/api/loans`, `/api/auth`, `/api/kyc`). Runs on V8 isolates with < 5ms startup times. | 100,000 requests per day. |
| **Cloudflare D1 (SQL)** | A serverless SQLite database storing structured transactional data (users, profiles, loans, payments, audit logs). | 5 million read rows/day, 100k write rows/day, 10 databases of 500MB. |
| **Cloudflare KV (Key-Value)**| Fast caching layer. Used for storing session metadata, OTP (One-Time Passwords) for verification, JWT blacklists, and sliding-window rate limit counters. | 100,000 read operations/day, 1,000 write operations/day, 1 GB storage. |
| **Cloudflare R2 (Object Store)**| S3-compatible, egress-fee-free storage. Securely stores KYC documents (ID scans, utility bills, proof of income) and signed loan contracts. | 10 GB storage, 1M Class A operations (writes), 10M Class B operations (reads)/month. |
| **Cloudflare Workers AI** | Runs AI models directly on Cloudflare's edge GPUs. Used for: <br>1. **OCR / Vision AI** (extracting text from national IDs).<br>2. **Risk Scoring / Text Analysis** (generating a credit narrative). | 10,000 AI Neurons per day (runs models like Llama 3 and Qwen). |
| **Cloudflare Zero Trust** | Secures the internal Loan Officer and Administrator dashboards. Connects with OAuth providers to restrict access strictly to company staff without writing custom RBAC. | Free up to 50 seats. |
| **Cloudflare Turnstile** | Smart, privacy-focused CAPTCHA alternative. Installed on registration, login, and application endpoints to block automated bot submissions. | Free (unlimited use). |
| **Cloudflare Email Routing** | Receives borrower inquiries on domain emails and routes them to a Worker to automate customer support or application inquiries. | Free. |

---

## 3. Relational Database Schema (D1 SQL)

Cloudflare D1 uses SQLite under the hood. The schema is designed for ACID compliance, enforcing foreign keys, and maintaining a strict transaction log for accounting.

```sql
-- 1. Users Table (Core Auth & Roles)
CREATE TABLE users (
    id TEXT PRIMARY KEY, -- UUIDv4
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('borrower', 'officer', 'admin')) NOT NULL DEFAULT 'borrower',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles Table (KYC & PII - Encrypted in application layer before save)
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    national_id_number TEXT UNIQUE NOT NULL,
    kyc_status TEXT CHECK(kyc_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    kyc_document_r2_key TEXT, -- Pointer to KYC document in Cloudflare R2
    ocr_extracted_data TEXT, -- JSON string of data extracted by Cloudflare AI
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Loans Table (Active and Requested Loans)
CREATE TABLE loans (
    id TEXT PRIMARY KEY, -- UUIDv4
    borrower_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    interest_rate REAL NOT NULL CHECK(interest_rate >= 0),
    term_months INTEGER NOT NULL CHECK(term_months > 0),
    status TEXT CHECK(status IN ('pending', 'under_review', 'approved', 'active', 'fully_paid', 'defaulted')) DEFAULT 'pending',
    risk_assessment_score REAL, -- Derived via rules + Workers AI
    risk_assessment_summary TEXT, -- Written by Workers AI LLM
    approved_by TEXT, -- User ID of Loan Officer
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(borrower_id) REFERENCES users(id),
    FOREIGN KEY(approved_by) REFERENCES users(id)
);

-- 4. Installments Table (Loan Amortization Schedule)
CREATE TABLE installments (
    id TEXT PRIMARY KEY, -- UUIDv4
    loan_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount_due REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    status TEXT CHECK(status IN ('unpaid', 'partial', 'paid', 'overdue')) DEFAULT 'unpaid',
    paid_at TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- 5. Transactions Table (Double-Entry Ledger)
CREATE TABLE transactions (
    id TEXT PRIMARY KEY, -- UUIDv4
    loan_id TEXT NOT NULL,
    installment_id TEXT, -- Can be NULL for initial loan disbursement
    type TEXT CHECK(type IN ('disbursement', 'repayment', 'fee', 'interest_charge')) NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT CHECK(payment_method IN ('stripe', 'bank_transfer', 'mock_gateway')) NOT NULL,
    external_reference_id TEXT, -- Reference token from Stripe/Bank
    status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id),
    FOREIGN KEY(installment_id) REFERENCES installments(id)
);

-- 6. Audit Logs Table (For security, compliance and track records)
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, -- UUIDv4
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL, -- e.g., 'LOAN_APPROVED', 'KYC_REJECTED', 'PAYMENT_RECEIVED'
    target_type TEXT NOT NULL, -- e.g., 'loans', 'profiles', 'users'
    target_id TEXT NOT NULL,
    details TEXT, -- JSON string
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX idx_loans_borrower ON loans(borrower_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_installments_loan_due ON installments(loan_id, due_date);
CREATE INDEX idx_transactions_loan ON transactions(loan_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
```

---

## 4. Key Workflows & Cloudflare Integrations

### A. Zero-Trust Registration & KYC with Workers AI (OCR)

To prevent identity fraud while minimizing friction, borrowers upload their National ID card. We automate verification using Workers AI.

```
[Borrower Screen] ──────► Uploads ID Card Image ──────► [Worker Endpoint: /api/kyc]
                                                                  │
 ┌────────────────────────────────────────────────────────────────┘
 ▼
[Verify Turnstile CAPTCHA] (Block bots)
 │
 ▼
[Save raw photo to Cloudflare R2] (Private bucket, no public egress)
 │
 ▼
[Call Workers AI Vision Model]
 ├── Model: @cf/meta/llama-3.2-11b-vision-instruct
 └── Prompt: "Extract First Name, Last Name, National ID Number, and DOB from this document."
 │
 ▼
[Save OCR data + D1 Record] ───► Flag profile as "Pending" review by Loan Officers.
```

### B. Intelligent Underwriting & Risk Analysis (Workers AI LLM)

When a borrower requests a loan, the Worker gathers their profile data, history of previous loans (if any), and runs a serverless inference task.

- **Inference Model:** `@cf/meta/llama-3-8b-instruct`
- **Inference Context:**
  ```json
  {
    "requested_amount": 500,
    "term_months": 6,
    "reported_monthly_income": 2500,
    "has_outstanding_loans": false,
    "previous_repayment_rate": "100%",
    "ocr_mismatches_flag": false
  }
  ```
- **Output:** The LLM generates a risk analysis report and a score (1-100) used by loan officers to make fast, reliable decisions. This saves hundreds of manual review hours.

### C. Bulletproof Security Architecture

#### 1. End-to-End PII Encryption
To keep highly sensitive Personal Identifiable Information (PII) safe:
- Raw social numbers, addresses, and full names are **AES-GCM encrypted** in the Worker before being written to D1.
- Encryption keys are stored securely using Cloudflare Workers Secret Environment Variables.
- D1 DB leaks (extremely rare but hypothetically possible) would yield only ciphertext.

#### 2. Administrative Controls via Cloudflare Access (Zero Trust)
To secure the admin panel without custom authentication bloat:
- Set up a Cloudflare Access policy guarding the `/admin/*` routes.
- Force all team members (Loan Officers, Admins) to authenticate via Google SSO, GitHub, or Active Directory before requests ever reach the origin worker.
- Access logs are recorded automatically in the Cloudflare Dashboard.

#### 3. Client Protection with Turnstile
- Integrated into front-end submission forms.
- If a bot attempts to brute-force loan submissions or credentials, Turnstile flags them without annoying real humans with traditional fuzzy CAPTCHAs.

---

## 5. Development & Project Structure

The project will be built as a monorepo utilizing **Wrangler** (the Cloudflare CLI) for seamless local emulation and lightning-fast deployment.

### Folder Layout

```
microloans/
├── .claude/                   # Environment / AI tool configs
├── schema.sql                 # D1 SQL Schema
├── wrangler.toml              # Cloudflare Project Configuration
├── package.json               # Monorepo configuration
├── api/                       # Cloudflare Workers Backend (TypeScript)
│   ├── src/
│   │   ├── index.ts           # Main Router (using Hono framework)
│   │   ├── db.ts              # Database helper & queries
│   │   ├── ai.ts              # Cloudflare Workers AI interactions
│   │   └── crypto.ts          # Web Crypto AES-GCM PII encryption
│   └── tsconfig.json
└── frontend/                  # React + Vite Client (Cloudflare Pages)
    ├── index.html
    ├── src/
    │   ├── components/        # Turnstile verification widgets, loan forms
    │   ├── views/             # Borrower Dashboard, Loan application, Admin table
    │   └── main.tsx
    ├── vite.config.ts
    └── package.json
```

### `wrangler.toml` Configuration File

This file configures the integration of all services in a single place:

```toml
name = "microloans-platform"
main = "api/src/index.ts"
compatibility_date = "2026-06-25"

# 1. Cloudflare Pages asset hosting
[site]
bucket = "./frontend/dist"

# 2. Key-Value namespace bindings (KV)
[[kv_namespaces]]
binding = "LOAN_CACHE"
id = "xxxxxxxxxxxx_kv_id"
preview_id = "xxxxxxxxxxxx_kv_preview_id"

# 3. SQLite Database bindings (D1)
[[d1_databases]]
binding = "DB"
database_name = "microloans_db"
database_id = "xxxxxxxxxxxx_db_id"
migrations_dir = "./api/migrations"

# 4. S3-Compatible Object Storage bindings (R2)
[[r2_buckets]]
binding = "KYC_BUCKET"
bucket_name = "microloans-kyc"

# 5. Workers AI model binding
[ai]
binding = "AI"
```

---

## 6. Execution & Step-by-Step Deployment Roadmap

Here is the exact action plan to bring this system online:

### Phase 1: Local Environment & DB Setup
1. **Initialize Wrangler:** Install packages and initialize Wrangler configuration.
2. **Setup D1 Database:** Create a local D1 instance and run schema migrations.
   ```bash
   npx wrangler d1 create microloans_db
   # Apply schema.sql locally for testing
   npx wrangler d1 execute microloans_db --local --file=./schema.sql
   ```
3. **Setup R2 Storage & KV:** Initialize buckets and caching namespace.
   ```bash
   npx wrangler r2 bucket create microloans-kyc
   npx wrangler kv:namespace create LOAN_CACHE
   ```

### Phase 2: API & Core Logic (Workers)
1. **Routing Setup:** Build clean routing in `api/src/index.ts` using **Hono** (a micro-framework optimized for Cloudflare Workers).
2. **Auth & Sessions:** Implement JWT token authentication, utilizing Web Crypto APIs for hashing and Cloudflare KV for maintaining valid session states.
3. **Transaction Flow:** Write D1 transaction queries for processing loan requests and auto-generating installment payment records.

### Phase 3: AI Core Integration
1. **KYC Verification:** Build the `/api/kyc/upload` endpoint. Upload verification images directly to R2, then run the image through `@cf/meta/llama-3.2-11b-vision-instruct` to extract text fields.
2. **Credit Decision Engine:** Build the loan score generator worker that passes structural borrower variables to `@cf/meta/llama-3-8b-instruct`.

### Phase 4: Frontend Development & Turnstile
1. **Vite + React App:** Develop the borrower dashboard and application pages.
2. **Turnstile CAPTCHA Integration:** Add Turnstile script into the registration flow. Validate the client token in the Workers authentication middleware.
3. **Admin Panel:** Create a dashboard view containing pending loans, verification documents, and approve/reject actions.

### Phase 5: Security & Production Deployment
1. **Zero-Trust Access Configuration:** Register the dashboard route `/admin` with Cloudflare Access. Configure SSO identity provider.
2. **Environment Secrets:** Populate encryption keys and external webhook secrets securely.
   ```bash
   npx wrangler secret put DECRYPTION_KEY
   ```
3. **Deploy:** Compile the frontend and push the entire stack to Cloudflare with one command.
   ```bash
   npm run deploy # Runs wrangler deploy / wrangler pages deploy
   ```

---

## 7. Operational & Technical Evaluation of Free Services

By utilizing Cloudflare’s free tier, we establish a zero-cost operational framework for standard scale:

- **100,000 API Requests/Day** allows roughly **3,000 active sessions daily** (assuming ~33 requests per session for browsing, checking loans, and paying installments).
- **D1's 5 Million Read Rows/Day** is optimized by indexing foreign keys and using KV caching. For example, popular queries (e.g., fetching a borrower’s active profile) can be cached in Cloudflare KV with a TTL, keeping D1 reads strictly reserved for real-time transactions.
- **R2's No Egress Fees** is a game-changer. Standard AWS S3 setups charge hefty egress fees for downloading large files (like scans and utility bills). R2 allows the admin dashboard to fetch and preview verification materials limitlessly.
