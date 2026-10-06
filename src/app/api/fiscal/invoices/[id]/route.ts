import { fiscalResponse } from "@/features/fiscal/http";
import { loadFiscalPanelState } from "@/features/fiscal/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fiscalResponse(request, false, ({ supabase }) => loadFiscalPanelState(supabase, id));
}
