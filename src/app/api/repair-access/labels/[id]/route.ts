import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrder } from "@/features/repairs-access/queries";
import { generateWorkshopLabelPdf } from "@/features/repairs-access/workshop-label-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'" };
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requirePermission("repairs.view"); }
  catch { return error("Necesitas acceso al taller para imprimir etiquetas.", 403); }
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return error("La orden no es valida.", 400);

  try {
    const supabase = await createServerSupabaseClient();
    // Read the saved order only. Printing never invokes intake or numbering actions.
    const result = await (supabase as any).rpc("workshop_order_payload", { p_order_id: id.data });
    if (result.error?.code === "42501") return error("No tienes acceso a esta orden.", 403);
    if (result.error?.code === "P0002") return error("No se encontro la orden.", 404);
    if (result.error) return error("No se pudo consultar la orden. Intenta nuevamente.", 503);
    if (!result.data) return error("No se encontro la orden.", 404);

    const order = mapOrder(result.data);
    const orderUrl = new URL("/reparaciones-access", process.env.NEXT_PUBLIC_APP_URL || "https://chetech-admin.vercel.app");
    orderUrl.searchParams.set("view", "detalle");
    orderUrl.searchParams.set("order", id.data);
    const pdf = await generateWorkshopLabelPdf({
      number: order.repairNumber,
      customerName: order.customer.fullName,
      device: [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - "),
      issueReported: order.issueReported,
      accessories: order.device.accessoryDetails,
      intakeDate: order.intakeDate,
      orderUrl: orderUrl.toString()
    });
    return new NextResponse(new Uint8Array(pdf), { headers: {
      ...headers, "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="CHETECH-${order.repairNumber.replace(/[^A-Za-z0-9-]/g, "")}-etiqueta-80x50.pdf"`
    } });
  } catch {
    return error("No se pudo generar la etiqueta. La orden sigue guardada; intenta nuevamente.", 500);
  }
}
