-- Plaid bank-connection items (one per user in sandbox). access_token is
-- AES-GCM encrypted at the application layer before insert.
CREATE TABLE plaid_items (
    user_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    bank_safety_score REAL NOT NULL,
    bank_signals TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
