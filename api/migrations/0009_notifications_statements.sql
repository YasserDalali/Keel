-- In-app notifications, one row per recipient (staff events fan out to every officer/admin).
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

-- Allow statement and deposit-receipt PDFs. SQLite can't alter a CHECK, so rebuild (nothing references documents).
CREATE TABLE documents_v2 (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('account_opened', 'loan_agreement', 'payment_receipt', 'deposit_receipt', 'statement')),
  reference_id  TEXT,
  r2_key        TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO documents_v2 (id, user_id, document_type, reference_id, r2_key, created_at)
  SELECT id, user_id, document_type, reference_id, r2_key, created_at FROM documents;
DROP TABLE documents;
ALTER TABLE documents_v2 RENAME TO documents;
CREATE INDEX idx_documents_user ON documents(user_id);
