import type { Context } from "hono";

export function jsonError(c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, details } }, status);
}

export function parseAllowedOrigins(value: string) {
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}
