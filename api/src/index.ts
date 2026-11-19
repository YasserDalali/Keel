import { Hono } from "hono";
import { cors } from "hono/cors";
import { servicesFor } from "./app/container";
import config from "./app/config";
import { demoRoutes } from "./app/demo-routes";
import docs from "./app/docs";
import health from "./app/health";
import { kycRoutes, bankRoutes, profileRoutes, webhookRoutes } from "./contexts/borrower/interface/routes";
import notifications from "./contexts/communication/interface/routes";
import documents from "./contexts/documents/interface/routes";
import { identityRoutes } from "./contexts/identity/interface/routes";
import { lendingRoutes } from "./contexts/lending/interface/routes";
import { installmentRoutes } from "./contexts/payments/interface/installment-routes";
import { paymentRoutes } from "./contexts/payments/interface/routes";
import { historyRoutes, reminderRoutes, scheduleRoutes, transactionRoutes } from "./contexts/reporting/interface/routes";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", async (c, next) => {
  c.set("services", servicesFor(c.env));
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
      // Pages: microloans.pages.dev and preview URLs like 94391843.microloans.pages.dev
      if (/^https:\/\/([\w-]+\.)*pages\.dev$/.test(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Platform
app.route("/api/health", health);
app.route("/api/config", config);
// One router per context
app.route("/api/auth", identityRoutes);
app.route("/api/loans", lendingRoutes);
app.route("/api/loans", installmentRoutes); // manual repayment: payments' route, under the loans URL
app.route("/api/payments", paymentRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/kyc", kycRoutes);
app.route("/api/plaid", bankRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/documents", documents);
app.route("/api/notifications", notifications);
app.route("/api/schedule", scheduleRoutes);
app.route("/api/transactions", transactionRoutes);
app.route("/api/reminders", reminderRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/demo", demoRoutes);
app.route("/docs", docs);
app.get("/openapi.json", (c) => c.json(openApiSpec));
// Everything else is the Keel frontend (static assets, SPA fallback). Unknown /api paths stay JSON 404s.
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
// The Hono app is the module's default export (tests call app.request); wrangler also reads `scheduled` off it for the cron.
const worker = app as typeof app & { scheduled: ExportedHandlerScheduledHandler<Bindings> };
worker.scheduled = async (_event, env, ctx) => {
  ctx.waitUntil(servicesFor(env).lending.markOverdue.execute()); // daily: persist overdue installments (wrangler.toml [triggers])
};
export default worker;
