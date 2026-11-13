"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: ReturnType<typeof createBrowserClient<any, any, any>> | null = null;

export function browserClient() {
  if (!client) {
    client = createBrowserClient<any, any, any>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: SCHEMA },
    });
  }
  return client;
}
