import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import type { Env } from "../env";

export type AppUser = { id: string; email?: string | null };

export function serviceClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function authClient(env: Env, token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } }
  });
}

export async function requireUser(c: Context<{ Bindings: Env }>): Promise<AppUser | Response> {
  const header = c.req.header("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return c.json({ error: { code: "unauthorized", message: "Missing bearer token" } }, 401);

  const client = authClient(c.env, token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401);
  return { id: data.user.id, email: data.user.email };
}
