import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Cliente con la sesión del admin (cookies). RLS decide qué puede ver.
export function authClient() {
  const store = cookies();
  return createServerClient<any, any, any>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components no pueden escribir cookies; el middleware refresca la sesión.
        }
      },
    },
  });
}
