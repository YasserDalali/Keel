import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import kyc from "./routes/kyc";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/kyc", kyc);

export default app;
