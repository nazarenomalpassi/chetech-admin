import { NextResponse } from "next/server";
import { z } from "zod";
import { getInvoiceById } from "@/features/invoices/queries";
import { generateInvoicePdf } from "@/features/invoices/pdf";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Necesitas iniciar sesion para descargar el comprobante." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Comprobante invalido." }, { status: 400 });
  try {
    const invoice = await getInvoiceById(id);
    const pdf = await generateInvoicePdf(invoice);
    const filename = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store"
    } });
  } catch {
    return NextResponse.json({ error: "No se pudo generar el PDF del comprobante." }, { status: 500 });
  }
}
