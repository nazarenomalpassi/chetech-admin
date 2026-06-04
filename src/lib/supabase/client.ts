"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import { getSupabasePublicKey } from "@/lib/supabase/config";

export function createClientSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey()!
  );
}
