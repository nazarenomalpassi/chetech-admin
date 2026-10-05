import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOrder } from "@/features/repairs-access/queries";
import { buildRepairDocumentData, type RepairBudgetSnapshot } from "@/features/repairs-access/documents";
import { generateRepairDocumentPdf } from "@/features/repairs-access/repair-document-pdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requirePermission("repairs.view");
  const id = z.string().uuid().safeParse((await params).id);
  const kind = z.enum(["intake", "estimate", "delivery"]).safeParse(new URL(request.url).searchParams.get("kind") ?? "intake");
  if (!id.success || !kind.success) return NextResponse.json({ error: "Documento no valido." }, { status: 400 });
  if (kind.data === "estimate" && profile.role !== "admin") return NextResponse.json({ error: "Solo administracion puede emitir el presupuesto versionado." }, { status: 403 });
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).rpc("workshop_order_payload", { p_order_id: id.data });
  if (result.error || !result.data) return NextResponse.json({ error: "No se encontro la orden." }, { status: 404 });
  let order = mapOrder(result.data);
  let quote: RepairBudgetSnapshot | null = null;
  if (kind.data === "estimate") {
    const revision = z.number().int().positive().safeParse(result.data.budget_revision);
    if (!revision.success) return NextResponse.json({ error: "Guarda una revision del presupuesto antes de imprimirlo." }, { status: 409 });
    const snapshot = await (supabase as any).from("repair_budget_versions").select("id,order_id,revision,amount,detail,created_at")
      .eq("order_id", id.data).eq("revision", revision.data).maybeSingle();
    if (snapshot.error) return NextResponse.json({ error: "No se pudo consultar la revision del presupuesto." }, { status: 503 });
    if (!snapshot.data) return NextResponse.json({ error: "La revision vigente no tiene un snapshot registrado. Guarda el presupuesto antes de imprimirlo." }, { status: 409 });
    const parsed = z.object({ id: z.string().uuid(), order_id: z.literal(id.data), revision: z.literal(revision.data), amount: z.coerce.number().finite().nonnegative(), detail: z.string(), created_at: z.string().datetime({ offset: true }) }).safeParse(snapshot.data);
    if (!parsed.success) return NextResponse.json({ error: "La revision del presupuesto requiere revision de sus datos." }, { status: 409 });
    const current = await (supabase as any).rpc("workshop_order_payload", { p_order_id: id.data });
    if (current.error || !current.data) return NextResponse.json({ error: "No se pudo verificar la revision vigente." }, { status: 503 });
    if (current.data.budget_revision !== revision.data) return NextResponse.json({ error: "El presupuesto cambio. Recarga antes de imprimir la revision vigente." }, { status: 409 });
    order = mapOrder(current.data);
    quote = { id: parsed.data.id, orderId: parsed.data.order_id, revision: parsed.data.revision, amount: parsed.data.amount, detail: parsed.data.detail, createdAt: parsed.data.created_at };
  }
  let data: ReturnType<typeof buildRepairDocumentData>;
  try { data = buildRepairDocumentData(order, kind.data, quote); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Revisa los datos del documento." }, { status: 409 }); }
  const orderUrl = new URL("/reparaciones-access", process.env.NEXT_PUBLIC_APP_URL || "https://chetech-admin.vercel.app");
  orderUrl.searchParams.set("order", id.data);
  let pdf: Buffer;
  try { pdf = await generateRepairDocumentPdf(data, { orderUrl: orderUrl.toString() }); }
  catch { return NextResponse.json({ error: "No se pudo generar el documento. Intenta nuevamente." }, { status: 500 }); }
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.number.replace(/[^A-Za-z0-9-]/g,"")}-${kind.data}.pdf"`, "Cache-Control": "private, no-store" } });
}
