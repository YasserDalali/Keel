import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireAuth } from "../middleware/requireAuth";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type DocRow = {
  id: string;
  user_id: string;
  document_type: string;
  reference_id: string | null;
  r2_key: string;
  created_at: string;
};

app.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;
  const role = c.var.role;
  const filterUserId = c.req.query("userId");

  let query: string;
  let params: string[];

  if (role === "borrower") {
    query = "SELECT id, user_id, document_type, reference_id, r2_key, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC";
    params = [userId];
  } else if (filterUserId) {
    query = "SELECT id, user_id, document_type, reference_id, r2_key, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC";
    params = [filterUserId];
  } else {
    query = "SELECT id, user_id, document_type, reference_id, r2_key, created_at FROM documents ORDER BY created_at DESC";
    params = [];
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all<DocRow>();

  return c.json({
    documents: results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      documentType: r.document_type,
      referenceId: r.reference_id,
      r2Key: r.r2_key,
      createdAt: r.created_at,
    })),
  });
});

app.get("/:id", requireAuth, async (c) => {
  const userId = c.var.userId;
  const role = c.var.role;
  const docId = c.req.param("id");

  const row = await c.env.DB.prepare(
    "SELECT user_id, r2_key FROM documents WHERE id = ?"
  ).bind(docId).first<{ user_id: string; r2_key: string }>();

  if (!row) return c.json({ error: "Not found" }, 404);
  if (role === "borrower" && row.user_id !== userId) return c.json({ error: "Forbidden" }, 403);

  const obj = await c.env.DOCS_BUCKET.get(row.r2_key);
  if (!obj) return c.json({ error: "Not found" }, 404);

  const buf = await obj.arrayBuffer();
  return new Response(buf, {
    headers: { "Content-Type": "application/pdf" },
  });
});

export default app;
