import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});

export function getLoginErrorMessage(errorMessage?: string | null) {
  if (!errorMessage) return "No pudimos iniciar sesión. Revisá tus datos e intentá de nuevo.";

  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }

  return "No pudimos iniciar sesión. Revisá tus datos e intentá de nuevo.";
}
