import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import { getSupabasePublicKey, hasSupabaseEnv } from "@/lib/supabase/config";

export async function createServerSupabaseClient() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase environment variables are missing.");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            return;
          }
        }
      }
    }
  );
}
