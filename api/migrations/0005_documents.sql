CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('account_opened', 'loan_agreement', 'payment_receipt')),
  reference_id  TEXT,
  r2_key        TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_documents_user ON documents(user_id);
