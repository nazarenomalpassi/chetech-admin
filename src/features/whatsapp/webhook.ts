import { normalizeDocumentRecipient } from "./protocol";
type StatusEvent = { messageId: string; jobId: string | null; status: string; recipient: string; timestamp: string; error: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMetaEvents(payload: any, businessId: string, phoneId: string) {
  const statuses: StatusEvent[] = [], optouts: string[] = [];
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return { statuses, optouts };
  for (const entry of payload.entry.slice(0,100)) {
    if (entry.id !== businessId || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes.slice(0,100)) {
      const value = change.value;
      if (change.field !== "messages" || value?.metadata?.phone_number_id !== phoneId) continue;
      for (const status of Array.isArray(value.statuses) ? value.statuses.slice(0,100) : []) {
        if (typeof status.id !== "string" || !status.id.startsWith("wamid.") || !["sent","delivered","read","failed"].includes(status.status)) continue;
        const recipient = normalizeDocumentRecipient(String(status.recipient_id ?? "")), seconds = Number(status.timestamp);
        if (!recipient || !Number.isFinite(seconds) || seconds < 1262304000 || seconds > Date.now()/1000+600) continue;
        statuses.push({ messageId: status.id, jobId: uuid.test(status.biz_opaque_callback_data ?? "") ? status.biz_opaque_callback_data : null,
          status: status.status, recipient, timestamp: new Date(seconds*1000).toISOString(), error: status.errors?.[0]?.code ? `meta_${Number(status.errors[0].code)}` : null });
      }
      for (const message of Array.isArray(value.messages) ? value.messages.slice(0,100) : []) {
        if (message.type !== "text" || typeof message.text?.body !== "string") continue;
        const text = message.text.body.trim().replace(/\s+/g," ").toUpperCase();
        const phone = normalizeDocumentRecipient(String(message.from ?? ""));
        if (phone && ["BAJA","STOP","NO QUIERO RECIBIR COMPROBANTES"].includes(text)) optouts.push(phone);
      }
    }
  }
  return { statuses, optouts: [...new Set(optouts)] };
}
