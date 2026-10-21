import { buildDocumentTemplate, WhatsAppDeliveryError, type DocumentJob, type WhatsAppConfig } from "./protocol";

async function graph(config: WhatsAppConfig, path: string, init: RequestInit, sending = false) {
  let response: Response;
  try { response = await fetch(`https://graph.facebook.com/${config.version}/${path}`, { ...init, headers: { Authorization: `Bearer ${config.token}`, ...init.headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }); }
  catch { throw new WhatsAppDeliveryError(sending ? "send_timeout" : "provider_unavailable", sending ? "uncertain" : "retry"); }
  let data: any;
  try { data = await response.json(); } catch { throw new WhatsAppDeliveryError("provider_invalid_response", sending ? "uncertain" : "retry"); }
  if (!response.ok) {
    const code = typeof data.error?.code === "number" ? `meta_${data.error.code}` : `http_${response.status}`;
    const retryable=response.status===429 || data.error?.is_transient===true || [4,17,32,613,80007,130429,131056].includes(data.error?.code);
    throw new WhatsAppDeliveryError(code, response.status >= 500 ? sending ? "uncertain" : "retry" : retryable ? "retry" : "blocked");
  }
  return data;
}

export async function uploadDocument(config: WhatsAppConfig, bytes: Buffer, filename: string) {
  const body = new FormData();
  body.set("messaging_product", "whatsapp"); body.set("type", "application/pdf");
  body.set("file", new File([new Uint8Array(bytes)], filename, { type: "application/pdf" }));
  const result = await graph(config, `${config.phoneId}/media`, { method: "POST", body });
  if (typeof result.id !== "string") throw new WhatsAppDeliveryError("upload_unconfirmed", "retry");
  return result.id as string;
}

export async function sendDocument(config: WhatsAppConfig, job: DocumentJob, mediaId: string, filename: string) {
  const result = await graph(config, `${config.phoneId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildDocumentTemplate(config, job, mediaId, filename)) }, true);
  const id = result.messages?.[0]?.id;
  if (typeof id !== "string" || !id.startsWith("wamid.")) throw new WhatsAppDeliveryError("send_unconfirmed", "uncertain");
  return id;
}

export async function verifyProvider(config: WhatsAppConfig) {
  const phone = await graph(config, `${config.phoneId}?fields=id,display_phone_number,verified_name,code_verification_status`, { method: "GET" });
  if (phone.id !== config.phoneId || !String(phone.display_phone_number).replace(/\D/g, "").endsWith("3571544683") || phone.code_verification_status !== "VERIFIED") {
    throw new WhatsAppDeliveryError("business_phone_unverified", "blocked");
  }
  for (const name of [config.intakeTemplate, config.deliveryTemplate]) {
    const result = await graph(config, `${config.businessId}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,category,components&limit=100`, { method: "GET" });
    const template = result.data?.find((t: any) => t.name === name && t.language === config.language);
    const header = template?.components?.find((c: any) => c.type === "HEADER");
    const body = template?.components?.find((c: any) => c.type === "BODY");
    const variables = [...String(body?.text ?? "").matchAll(/{{(.*?)}}/g)].map((m) => m[1]);
    if (template?.status !== "APPROVED" || template?.category !== "UTILITY" || header?.format !== "DOCUMENT"
      || variables.length !== 2 || variables[0] !== "1" || variables[1] !== "2") throw new WhatsAppDeliveryError("templates_not_approved", "blocked");
  }
  return { phoneVerified: true, templatesApproved: true };
}
