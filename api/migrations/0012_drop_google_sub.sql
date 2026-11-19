-- Google sign-in was removed: drop its column and index.
DROP INDEX IF EXISTS idx_users_google_sub;
ALTER TABLE users DROP COLUMN google_sub;
