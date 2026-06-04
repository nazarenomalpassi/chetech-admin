import { cache } from "react";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const getAuthenticatedUser = cache(async () => {
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
});

export const requireUser = cache(async () => getAuthenticatedUser());

export const getCurrentProfile = cache(async () => {
  const user = await getAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (data) {
    return { user, profile: data };
  }

  const fallbackProfile = {
    id: user.id,
    full_name: user.email ?? "Usuario",
    role: "empleado"
  };

  const { data: createdProfile } = await (supabase as any)
    .from("profiles")
    .insert(fallbackProfile)
    .select("id, full_name, role")
    .single();

  return {
    user,
    profile: createdProfile ?? fallbackProfile
  };
});

export async function requireAdmin() {
  const { profile } = await getCurrentProfile();

  if (profile.role !== "admin") {
    redirect("/dashboard?error=Solo%20admin");
  }

  return profile;
}
