-- One transaction per external payment (Stripe PaymentIntent etc.): makes installment-confirm idempotent at the database level.
CREATE UNIQUE INDEX idx_transactions_external_ref ON transactions(external_reference_id) WHERE external_reference_id IS NOT NULL;
