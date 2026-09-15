import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Uses the anon key + RLS — never the service role key — so every query
 * this client makes is automatically scoped by the policies in
 * supabase/migrations/0003_rls_policies.sql.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component during render — the
            // middleware refreshes the session on the next request instead.
          }
        },
      },
    }
  );
}
