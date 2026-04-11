"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});

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
      message: error.message
    };
  }

  redirect("/dashboard");
}
