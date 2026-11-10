import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrder } from "@/features/repairs-access/queries";
import { generateWorkshopLabelPdf, generateWorkshopLabelPreview } from "@/features/repairs-access/workshop-label-pdf";
import type { WorkshopLabelData } from "@/features/repairs-access/workshop-label-pdf";
import { getOrderWarrantyReturns } from "@/features/repairs-access/warranty-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'" };
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers });
const selection = z.discriminatedUnion("variant", [
  z.object({ variant: z.literal("equipment") }).strict(),
  z.object({ variant: z.literal("accessory"), accessoryDescription: z.string().trim().min(1).max(120), accessoryIndex: z.number().int().min(1).max(99) }).strict(),
  z.object({ variant: z.literal("warranty") }).strict()
]);
type Selection = z.infer<typeof selection>;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try { await requirePermission("repairs.view"); }
  catch { return error("Necesitas acceso al taller para imprimir etiquetas.", 403); }
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return error("La orden no es valida.", 400);
  return renderSavedLabel(id.data, { variant: "equipment" });
}

/** Custom labels are private read operations; sensitive customization never enters a URL. */
export async function POST(request: Request, { params }: Context) {
  try { await requirePermission("repairs.view"); }
  catch { return error("Necesitas acceso al taller para imprimir etiquetas.", 403); }
  if (request.headers.get("Origin") !== new URL(request.url).origin) return error("Abre la impresion desde este sistema.", 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return error("La orden no es valida.", 400);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return error("Envia los datos en formato JSON.", 415);
  let parsed: z.SafeParseReturnType<unknown, Selection>;
  try {
    const body = await request.text();
    if (body.length > 4096) return error("Los datos de la etiqueta son demasiado extensos.", 413);
    parsed = selection.safeParse(JSON.parse(body));
  } catch { return error("Los datos de la etiqueta no son validos.", 400); }
  if (!parsed.success) return error("Revisa el tipo, la descripcion y el numero del accesorio (A1 a A99).", 400);
  return renderSavedLabel(id.data, parsed.data);
}

async function renderSavedLabel(id: string, variant: Selection) {
  try {
    const supabase = await createServerSupabaseClient();
    // Read the saved order only. Printing never invokes intake or numbering actions.
    const result = await (supabase as any).rpc("workshop_order_payload", { p_order_id: id });
    if (result.error?.code === "42501") return error("No tienes acceso a esta orden.", 403);
    if (result.error?.code === "P0002") return error("No se encontro la orden.", 404);
    if (result.error) return error("No se pudo consultar la orden. Intenta nuevamente.", 503);
    if (!result.data) return error("No se encontro la orden.", 404);

    const order = mapOrder(result.data);
    const orderUrl = new URL("/reparaciones-access", process.env.NEXT_PUBLIC_APP_URL || "https://chetech-admin.vercel.app");
    orderUrl.searchParams.set("view", "detalle");
    orderUrl.searchParams.set("order", id);
    let data: WorkshopLabelData = {
      number: order.repairNumber,
      customerName: order.customer.fullName,
      device: [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" - "),
      issueReported: order.issueReported,
      accessories: order.device.accessoryDetails,
      intakeDate: order.intakeDate,
      orderUrl: orderUrl.toString()
    };
    let suffix = "etiqueta";
    if (variant.variant === "accessory") {
      data = { ...data, ...variant };
      suffix = `accesorio-A${variant.accessoryIndex}`;
    } else if (variant.variant === "warranty") {
      let returns;
      try { returns = await getOrderWarrantyReturns([id]); }
      catch { return error("No se pudo consultar el reingreso de garantia. Intenta nuevamente.", 503); }
      // A closed visit must never be represented as the equipment's current re-entry.
      const active = returns.find(visit => visit.orderId === id && !visit.closedAt && visit.status !== "retirado");
      if (!active) return error("Esta orden no tiene un reingreso de garantia activo.", 409);
      data = { ...data, variant: "warranty", issueReported: active.issueReported, intakeDate: active.receivedOn, accessories: active.accessories };
      suffix = "reingreso-garantia";
    }
    // Generate once; return only a fit flag, never the temporary description, in headers.
    const preview = variant.variant === "accessory" ? await generateWorkshopLabelPreview(data) : null;
    const pdf = preview ? preview.pdf : await generateWorkshopLabelPdf(data);
    return new NextResponse(new Uint8Array(pdf), { headers: {
      ...headers, "Content-Type": "application/pdf",
      ...(preview ? { "X-CHETECH-Accessory-Truncated": preview.accessoryDescriptionTruncated ? "1" : "0" } : {}),
      "Content-Disposition": `inline; filename="CHETECH-${order.repairNumber.replace(/[^A-Za-z0-9-]/g, "")}-${suffix}-80x50.pdf"`
    } });
  } catch {
    return error("No se pudo generar la etiqueta. La orden sigue guardada; intenta nuevamente.", 500);
  }
}
