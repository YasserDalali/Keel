import { Hono } from "hono";
import health from "./routes/health";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api/health", health);

export default app;
