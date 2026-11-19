-- Per-borrower reminder preferences. No row = defaults (enabled, 3 days before), applied in code.
CREATE TABLE reminder_settings (
    user_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    days_before INTEGER NOT NULL DEFAULT 3 CHECK(days_before BETWEEN 1 AND 14),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Timestamps the transaction log and profile need. Older rows stay NULL; readers fall back.
ALTER TABLE loans ADD COLUMN upfront_paid_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN kyc_updated_at TIMESTAMP;
