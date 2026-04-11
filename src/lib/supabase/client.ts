"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

export function createClientSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
