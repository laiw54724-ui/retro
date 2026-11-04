import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn("Retro Desktop: Supabase env vars are missing. Auth will not work until configured.");
}

export const supabase = createClient(url || "https://example.supabase.co", anonKey || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
