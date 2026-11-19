import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "../../../shared/errors";
import { requireAuth } from "../../../middleware/requireAuth";
import type { Bindings, Variables } from "../../../types";
import type { DocumentSummary } from "../domain/document";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const STATUS: Record<string, ContentfulStatusCode> = { invalid_month: 400, document_forbidden: 403, document_not_found: 404 };
const fail = (c: { json: (b: unknown, s: ContentfulStatusCode) => Response }, e: unknown) => {
  if (e instanceof DomainError && STATUS[e.code]) return c.json({ error: e.message }, STATUS[e.code]);
  throw e;
};

const toJson = (d: DocumentSummary) => ({
  id: d.id, userId: d.ownerId, documentType: d.type, referenceId: d.referenceId, r2Key: d.storageKey, createdAt: d.createdAt,
  title: d.title, loanId: d.loanId, amount: d.amount,
});

app.get("/", requireAuth, async (c) => {
  const documents = await c.var.services.documents.list.execute({ userId: c.var.userId, role: c.var.role, ownerFilter: c.req.query("userId") });
  return c.json({ documents: documents.map(toJson) });
});

app.post("/statement", requireAuth, async (c) => {
  const body = await c.req.json<{ month?: unknown }>().catch(() => ({} as { month?: unknown }));
  try {
    return c.json({ document: toJson(await c.var.services.documents.generateStatement.execute({ userId: c.var.userId, month: body.month })) });
  } catch (e) {
    return fail(c, e);
  }
});

app.get("/:id", requireAuth, async (c) => {
  try {
    const pdf = await c.var.services.documents.open.execute({ documentId: c.req.param("id")!, userId: c.var.userId, role: c.var.role });
    return new Response(pdf, { headers: { "Content-Type": "application/pdf" } });
  } catch (e) {
    return fail(c, e);
  }
});

export default app;
