import type { Money } from "../../../shared/money";
import type { LedgerMethod, PaymentLedger, ReceiptLookup } from "../domain/ledger";

export class D1PaymentLedger implements PaymentLedger {
  constructor(private readonly db: D1Database) {}

  async recordDisbursement(p: { loanId: string; amount: Money }): Promise<void> {
    await this.db
      .prepare("INSERT INTO transactions (id, loan_id, type, amount, payment_method, status) VALUES (?, ?, 'disbursement', ?, 'mock_gateway', 'completed')")
      .bind(crypto.randomUUID(), p.loanId, p.amount.dollars)
      .run();
  }

  async recordRepayment(p: { loanId: string; installmentId: string; amount: Money; method: LedgerMethod; externalRef?: string }): Promise<boolean> {
    // Conditional insert: atomic, so two requests carrying the same provider reference can't both record it.
    const ref = p.externalRef ?? null;
    const r = await this.db
      .prepare(
        `INSERT INTO transactions (id, loan_id, installment_id, type, amount, payment_method, external_reference_id, status)
         SELECT ?, ?, ?, 'repayment', ?, ?, ?, 'completed'
         WHERE ? IS NULL OR NOT EXISTS (SELECT 1 FROM transactions WHERE external_reference_id = ?)`,
      )
      .bind(crypto.randomUUID(), p.loanId, p.installmentId, p.amount.dollars, p.method, ref, ref, ref)
      .run();
    return r.meta.changes > 0;
  }

  async hasRepayment(externalRef: string, installmentId: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT 1 FROM transactions WHERE external_reference_id = ? AND installment_id = ?").bind(externalRef, installmentId).first();
    return row !== null;
  }
}

// ponytail: reads the documents table directly; moves behind the Documents context's own query when that context is extracted.
export class D1ReceiptLookup implements ReceiptLookup {
  constructor(private readonly db: D1Database) {}

  async forInstallment(installmentId: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT id FROM documents WHERE document_type = 'payment_receipt' AND reference_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(installmentId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }
}
