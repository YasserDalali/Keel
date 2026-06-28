-- Rebuild profiles: drop OCR columns, make PII nullable, add Didit fields, expand kyc_status.
-- SQLite cannot ALTER CHECK constraints or drop NOT NULL in-place; recreate the table.
CREATE TABLE profiles_v2 (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    address TEXT,
    national_id_number TEXT,
    kyc_status TEXT CHECK(kyc_status IN (
        'pending', 'approved', 'declined',
        'in_review', 'in_progress', 'abandoned',
        'expired', 'resubmitted'
    )) DEFAULT 'pending',
    didit_session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO profiles_v2 (user_id, first_name, last_name, phone, address,
                          national_id_number, kyc_status, created_at)
SELECT user_id, first_name, last_name, phone, address,
       national_id_number,
       CASE kyc_status
           WHEN 'rejected' THEN 'declined'
           ELSE kyc_status
       END,
       created_at
FROM profiles;

DROP TABLE profiles;
ALTER TABLE profiles_v2 RENAME TO profiles;
