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
    kyc_document_r2_key TEXT,
    ocr_extracted_data TEXT,
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
    risk_assessment_score REAL,
    risk_assessment_summary TEXT,
    approved_by TEXT,
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
    installment_id TEXT,
    type TEXT CHECK(type IN ('disbursement', 'repayment', 'fee', 'interest_charge')) NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT CHECK(payment_method IN ('stripe', 'bank_transfer', 'mock_gateway')) NOT NULL,
    external_reference_id TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id),
    FOREIGN KEY(installment_id) REFERENCES installments(id)
);

-- 6. Audit Logs Table
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, -- UUIDv4
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loans_borrower ON loans(borrower_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_installments_loan_due ON installments(loan_id, due_date);
CREATE INDEX idx_transactions_loan ON transactions(loan_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
