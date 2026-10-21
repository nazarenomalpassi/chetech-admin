import { equalSecret, getWhatsAppConfig } from "@/features/whatsapp/protocol";
import { runWhatsAppWorker } from "@/features/whatsapp/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const config = getWhatsAppConfig();
  if (!config || !equalSecret(request.headers.get("authorization"), `Bearer ${config.workerSecret}`)) return Response.json({ error: "Acceso no autorizado." }, { status: 401 });
  try { return Response.json(await runWhatsAppWorker(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "No se pudo procesar la cola de documentos." }, { status: 503 }); }
}
