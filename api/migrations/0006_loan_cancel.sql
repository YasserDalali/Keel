-- Borrower cancellation. loans.status has no 'cancelled' (changing its CHECK needs a table rebuild),
-- so a cancelled loan is status 'defaulted' + cancelled_at, the same way officer declines use 'defaulted' + no approved_at.
ALTER TABLE loans ADD COLUMN cancelled_at TIMESTAMP;
