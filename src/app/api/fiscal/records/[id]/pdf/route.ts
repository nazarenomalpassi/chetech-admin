import { NextResponse } from "next/server";
import { fiscalResponse } from "@/features/fiscal/http";
import { getFiscalRecord } from "@/features/fiscal/service";
import { generateFiscalPdf } from "@/features/fiscal/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fiscalResponse(request, false, async ({ supabase }) => {
    const record = await getFiscalRecord(supabase, id);
    const pdf = await generateFiscalPdf(record);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="factura-C-${record.snapshot.environment}-${record.snapshot.pointOfSale}-${record.number}.pdf"`, "Cache-Control": "private, no-store" } });
  });
}
