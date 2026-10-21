import { equalSecret, getWhatsAppConfig, verifyMetaSignature } from "@/features/whatsapp/protocol";
import { createWhatsAppServiceClient } from "@/features/whatsapp/runtime";
import { parseMetaEvents } from "@/features/whatsapp/webhook";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const config = getWhatsAppConfig(), query = new URL(request.url).searchParams;
  if (!config || query.get("hub.mode") !== "subscribe" || !equalSecret(query.get("hub.verify_token"),config.verifyToken)) return new Response("Verificacion no autorizada.",{status:403});
  const challenge = query.get("hub.challenge");
  if (!challenge || !/^\d{1,100}$/.test(challenge)) return new Response("Solicitud no valida.",{status:400});
  const result = await createWhatsAppServiceClient().rpc("whatsapp_verify_webhook");
  if (result.error) return new Response("No se pudo verificar la conexion.",{status:503});
  return new Response(challenge,{headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const config = getWhatsAppConfig();
  if (!config) return new Response("Conexion pendiente.",{status:503});
  const reader = request.body?.getReader();
  if (!reader) return new Response("Solicitud vacia.",{status:400});
  const chunks: Uint8Array[] = []; let size=0;
  while (true) {
    const part=await reader.read(); if (part.done) break;
    size+=part.value.byteLength;
    if (size>1024*1024) { await reader.cancel(); return new Response("Solicitud demasiado grande.",{status:413}); }
    chunks.push(part.value);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  if (!verifyMetaSignature(raw,request.headers.get("x-hub-signature-256"),config.appSecret)) return new Response("Firma no valida.",{status:401});
  let payload: unknown;
  try { payload=JSON.parse(raw); } catch { return new Response("JSON no valido.",{status:400}); }
  const events=parseMetaEvents(payload,config.businessId,config.phoneId);
  const client=createWhatsAppServiceClient();
  try {
    for (const phone of events.optouts) { const result=await client.rpc("whatsapp_document_optout",{p_phone:phone}); if(result.error) throw new Error(); }
    for (const s of events.statuses) {
      const result=await client.rpc("whatsapp_document_status",{p_message_id:s.messageId,p_job_id:s.jobId,p_status:s.status,p_recipient:s.recipient,p_timestamp:s.timestamp,p_error:s.error});
      if(result.error) throw new Error();
    }
  } catch { return new Response("No se pudo registrar el estado.",{status:503}); }
  return new Response("EVENT_RECEIVED",{headers:{"Cache-Control":"no-store"}});
}
