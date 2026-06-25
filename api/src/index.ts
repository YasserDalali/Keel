import { Hono } from "hono";
import health from "./routes/health";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);

export default app;
