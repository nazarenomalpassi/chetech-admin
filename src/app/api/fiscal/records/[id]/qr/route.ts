import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { fiscalResponse } from "@/features/fiscal/http";
import { getFiscalRecord } from "@/features/fiscal/service";
import { buildFiscalQrUrl } from "@/features/fiscal/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fiscalResponse(request, false, async ({ supabase }) => {
    const record = await getFiscalRecord(supabase, id);
    const png = await QRCode.toBuffer(buildFiscalQrUrl(record), { type: "png", width: 280, margin: 1 });
    return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  });
}
