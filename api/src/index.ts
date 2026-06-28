import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import plaid from "./routes/plaid";
import profile from "./routes/profile";
import payments from "./routes/payments";
import config from "./routes/config";
import docs from "./routes/docs";
import webhooks from "./routes/webhooks";
import documents from "./routes/documents";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/plaid", plaid);
app.route("/api/profile", profile);
app.route("/api/payments", payments);
app.route("/api/config", config);
app.route("/api/webhooks", webhooks);
app.route("/api/documents", documents);
app.route("/docs", docs);
app.get("/", (c) => c.redirect("/docs"));
app.get("/openapi.json", (c) => c.json(openApiSpec));
export default app;
