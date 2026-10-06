import { fiscalResponse } from "@/features/fiscal/http";
import { previewFiscalInvoice } from "@/features/fiscal/service";
import { readFiscalJson } from "@/features/fiscal/request-security";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fiscalResponse(request, true, async () => previewFiscalInvoice(id, await readFiscalJson(request)));
}
