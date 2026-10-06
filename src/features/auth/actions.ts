"use server";

import { redirect } from "next/navigation";

import { getLoginErrorMessage, loginSchema } from "@/features/auth/login-schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(_: unknown, formData: FormData) {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "No se pudo validar el formulario"
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return {
      success: false,
      message: getLoginErrorMessage(error.message)
    };
  }

  redirect("/dashboard");
}
