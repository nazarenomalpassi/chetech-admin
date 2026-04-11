import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function requireUser() {
  if (!hasSupabaseEnv()) {
    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
