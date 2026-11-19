import { GenerateStatement, ListDocuments, OpenDocument } from "../../contexts/documents/application/use-cases";
import { subscribeDocuments } from "../../contexts/documents/application/subscribers";
import { D1DocumentQueries, R2D1DocumentRepository } from "../../contexts/documents/infrastructure/d1-document-repository";
import { BorrowerDirectoryGateway, D1LoanSummaries } from "../../contexts/documents/infrastructure/d1-statement-readers";
import { PdfDocumentRenderer } from "../../contexts/documents/infrastructure/pdf-renderer";
import type { Wiring } from "./shared";
import type { BorrowerServices } from "./borrower";
import type { IdentityServices } from "./identity";

export function wireDocuments({ env, bus, clock, ids }: Wiring, { identity, borrower }: { identity: IdentityServices; borrower: BorrowerServices }) {
  const repo = new R2D1DocumentRepository(env.DB, env.DOCS_BUCKET);
  const queries = new D1DocumentQueries(env.DB);
  const renderer = new PdfDocumentRenderer();
  subscribeDocuments(bus, renderer, repo);
  return {
    list: new ListDocuments(queries),
    open: new OpenDocument(repo),
    generateStatement: new GenerateStatement({
      repo, queries, renderer, borrowers: new BorrowerDirectoryGateway(
        (userId) => identity.account.execute({ userId }),
        async (userId) => (await borrower.ownProfile.execute({ userId })).profile,
      ), summaries: new D1LoanSummaries(env.DB), clock, ids,
    }),
  };
}
