import type { Clock } from "../../../shared/clock";
import type { IdGenerator } from "../../../shared/ids";
import { DocumentForbidden, DocumentNotFound, type DocumentQueries, type DocumentRepository, type DocumentSummary } from "../domain/document";
import { composeStatement, StatementPeriod } from "../domain/statement";
import type { BorrowerDirectory, DocumentRenderer, LoanSummaries } from "./ports";

type Role = "borrower" | "officer" | "admin";

export class ListDocuments {
  constructor(private queries: DocumentQueries) {}

  /** Borrowers see their own; staff see everyone's, or one person's with `ownerFilter`. */
  execute(q: { userId: string; role: Role; ownerFilter?: string }): Promise<DocumentSummary[]> {
    return this.queries.list(q.role === "borrower" ? q.userId : q.ownerFilter);
  }
}

export class OpenDocument {
  constructor(private repo: DocumentRepository) {}

  async execute(q: { documentId: string; userId: string; role: Role }): Promise<ArrayBuffer> {
    const doc = await this.repo.contentOf(q.documentId);
    if (!doc) throw new DocumentNotFound();
    if (q.role === "borrower" && doc.ownerId !== q.userId) throw new DocumentForbidden();
    return doc.pdf;
  }
}

/** Generate (or regenerate) the caller's statement for a month, defaulting to the current one (UTC). */
export class GenerateStatement {
  constructor(
    private d: { repo: DocumentRepository; queries: DocumentQueries; renderer: DocumentRenderer; borrowers: BorrowerDirectory; summaries: LoanSummaries; clock: Clock; ids: IdGenerator },
  ) {}

  async execute(cmd: { userId: string; month?: unknown }): Promise<DocumentSummary> {
    const period = StatementPeriod.of(cmd.month ?? this.d.clock.now().toISOString().slice(0, 7));
    const [holder, facts] = await Promise.all([this.d.borrowers.holderOf(cmd.userId), this.d.summaries.forStatement(cmd.userId, period)]);
    const docId = this.d.ids.next();
    const pdf = await this.d.renderer.statement(composeStatement({ docId, period, holder, facts }));
    await this.d.repo.add({ id: docId, ownerId: cmd.userId, type: "statement", referenceId: period.month }, pdf);
    return (await this.d.queries.byId(docId))!;
  }
}
