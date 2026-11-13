import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";

// Cliente anónimo sin sesión: catálogo público, checkout y bot (RPCs).
export function publicClient(): SupabaseClient<any, any, any> | null {
  if (!supabaseConfigured) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
