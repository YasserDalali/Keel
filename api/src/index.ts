import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);

export default app;
