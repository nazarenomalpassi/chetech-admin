import { fiscalResponse } from "@/features/fiscal/http";
import { loadFiscalPanelState } from "@/features/fiscal/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return fiscalResponse(request, false, ({ supabase }) => loadFiscalPanelState(supabase));
}
