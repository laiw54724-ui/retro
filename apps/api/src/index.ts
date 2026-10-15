import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { parseAllowedOrigins } from "./lib/http";
import { assets } from "./routes/assets";
import { sites } from "./routes/sites";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("/api/*", async (c, next) => {
  const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS || "");
  return cors({
    origin: (origin) => allowed.has(origin) ? origin : "",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400
  })(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "retrodesk-api" }));
app.route("/api", sites);
app.route("/api", assets);

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: { code: "internal_error", message: "Unexpected server error" } }, 500);
});

export default app;
