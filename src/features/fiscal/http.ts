import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPermission, normalizeAppRole } from "@/lib/permissions";
import { assertFiscalOrigin, FiscalHttpError } from "./request-security";
import type { FiscalReadClient } from "./repository";

export async function requireFiscalAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new FiscalHttpError(401, "Inicia sesion para gestionar comprobantes fiscales.");
  const { data: profile, error: profileError } = await (supabase as unknown as FiscalReadClient).from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !hasPermission(normalizeAppRole(profile?.role), "invoices.manage")) throw new FiscalHttpError(403, "Solo un administrador puede emitir o consultar comprobantes fiscales.");
  return { supabase, userId: user.id };
}
export async function fiscalResponse(request: Request, mutation: boolean, handler: (actor: Awaited<ReturnType<typeof requireFiscalAdmin>>) => Promise<unknown>) {
  try {
    if (mutation) assertFiscalOrigin(request);
    const actor = await requireFiscalAdmin();
    const result = await handler(actor);
    if (result instanceof Response) return result;
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof FiscalHttpError ? error.status : error instanceof z.ZodError ? 400 : 503;
    const message = error instanceof FiscalHttpError ? error.message : error instanceof z.ZodError ? "Revisa documento, condicion IVA, concepto y fechas fiscales." : "No se pudo completar la operacion fiscal. Consulta el estado antes de reintentar; no se confirma una emision sin CAE.";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
