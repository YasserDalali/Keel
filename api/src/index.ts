import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import kyc from "./routes/kyc";
import plaid from "./routes/plaid";
import profile from "./routes/profile";
import payments from "./routes/payments";
import config from "./routes/config";
import docs from "./routes/docs";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/kyc", kyc);
app.route("/api/plaid", plaid);
app.route("/api/profile", profile);
app.route("/api/payments", payments);
app.route("/api/config", config);
app.route("/docs", docs);
app.get("/", (c) => c.redirect("/docs"));
app.get("/openapi.json", (c) => c.json(openApiSpec));
export default app;
