import { cache } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isSupabaseAuthRateLimitError } from "@/lib/supabase/auth-errors";
import {
  hasPermission,
  normalizeAppRole,
  type AppPermission
} from "@/lib/permissions";

async function getSessionUserFallback(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

const getAuthenticatedUser = cache(async () => {
  if (!hasSupabaseEnv()) {
    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();
  let user = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;

    if (!user && isSupabaseAuthRateLimitError(error)) {
      user = await getSessionUserFallback(supabase);
    }
  } catch (error) {
    if (isSupabaseAuthRateLimitError(error)) {
      user = await getSessionUserFallback(supabase);
    }
  }

  if (!user) {
    redirect("/login");
  }

  return user;
});

export const requireUser = cache(async () => getAuthenticatedUser());

export const getCurrentProfile = cache(async () => {
  const user = await getAuthenticatedUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    redirect("/login?error=session");
  }

  if (data) {
    const role = normalizeAppRole(data.role);

    if (!role) {
      redirect("/acceso-denegado" as Route);
    }

    return {
      user,
      profile: {
        ...data,
        role
      }
    };
  }

  redirect("/acceso-denegado" as Route);
});

export async function requirePermission(permission: AppPermission) {
  const { profile } = await getCurrentProfile();

  if (!hasPermission(profile.role, permission)) {
    redirect("/dashboard?error=Sin%20permiso");
  }

  return profile;
}

export async function requireAdmin() {
  return requirePermission("settings.manage");
}
