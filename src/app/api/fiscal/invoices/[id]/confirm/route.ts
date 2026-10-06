import { fiscalResponse } from "@/features/fiscal/http";
import { confirmFiscalInvoice } from "@/features/fiscal/service";
import { readFiscalJson } from "@/features/fiscal/request-security";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fiscalResponse(request, true, async ({ userId }) => confirmFiscalInvoice(id, await readFiscalJson(request), userId));
}
