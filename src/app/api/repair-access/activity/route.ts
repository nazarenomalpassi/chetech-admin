import { NextResponse } from "next/server";
import { z } from "zod";
import { activityCursorSchema, activityPageSchema } from "@/features/repairs-access/activity";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  try { await requirePermission("repairs.view"); }
  catch { return privateJson({ error: "Necesitas acceso al taller para consultar el historial." }, 403); }

  const params = new URL(request.url).searchParams;
  const order = z.string().uuid().safeParse(params.get("orderId"));
  const date = params.get("cursorDate");
  const id = params.get("cursorId");
  const cursor = date !== null || id !== null ? activityCursorSchema.safeParse({ date, id }) : null;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!order.success || (cursor && !cursor.success) || !Number.isSafeInteger(limit) || limit < 1) {
    return privateJson({ error: "La orden o la pagina de historial no es valida." }, 400);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("get_workshop_activity_page", {
      p_order_id: order.data,
      p_cursor_date: cursor?.data?.date ?? null,
      p_cursor_id: cursor?.data?.id ?? null,
      p_limit: Math.min(30, limit)
    });
    if (error) {
      if (error.code === "42501") return privateJson({ error: "No tienes permiso para consultar este historial." }, 403);
      if (error.code === "P0002") return privateJson({ error: "La orden ya no esta disponible." }, 404);
      if (error.code === "22023") return privateJson({ error: "La pagina de historial no es valida. Vuelve a abrir la orden." }, 400);
      if (error.code === "PGRST202" || error.code === "42883") return privateJson({ error: "El historial completo todavia no esta disponible. Intenta mas tarde." }, 503);
      throw new Error("Activity read failed");
    }
    return privateJson(activityPageSchema.parse(data));
  } catch {
    return privateJson({ error: "No se pudo cargar el historial. Intenta de nuevo." }, 500);
  }
}
