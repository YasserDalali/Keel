-- Allow PayPal as a transaction payment method. SQLite can't alter a CHECK, so rebuild (no table references transactions).
CREATE TABLE transactions_v2 (
    id TEXT PRIMARY KEY, -- UUIDv4
    loan_id TEXT NOT NULL,
    installment_id TEXT,
    type TEXT CHECK(type IN ('disbursement', 'repayment', 'fee', 'interest_charge')) NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT CHECK(payment_method IN ('stripe', 'paypal', 'bank_transfer', 'mock_gateway')) NOT NULL,
    external_reference_id TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id),
    FOREIGN KEY(installment_id) REFERENCES installments(id)
);
INSERT INTO transactions_v2 (id, loan_id, installment_id, type, amount, payment_method, external_reference_id, status, created_at)
  SELECT id, loan_id, installment_id, type, amount, payment_method, external_reference_id, status, created_at FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_v2 RENAME TO transactions;
CREATE UNIQUE INDEX idx_transactions_external_ref ON transactions(external_reference_id) WHERE external_reference_id IS NOT NULL;
