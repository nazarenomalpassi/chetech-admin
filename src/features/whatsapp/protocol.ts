import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppConfig = { token: string; phoneId: string; businessId: string; version: string; appSecret: string; verifyToken: string; workerSecret: string; language: string; intakeTemplate: string; deliveryTemplate: string };
export type DocumentJob = { id: string; order_id: string; kind: "intake" | "delivery"; lease_token: string; recipient: string; media_id: string | null; created_at: string; snapshot: Record<string, any> };

export function getWhatsAppConfig(env: Record<string, string | undefined> = process.env): WhatsAppConfig | null {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return null;
  const values = [env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_BUSINESS_ACCOUNT_ID, env.WHATSAPP_GRAPH_VERSION,
    env.WHATSAPP_APP_SECRET, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, env.WHATSAPP_WORKER_SECRET, env.SUPABASE_SERVICE_ROLE_KEY];
  if (values.some((value) => !value?.trim())) return null;
  if (!/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID!) || !/^\d+$/.test(env.WHATSAPP_BUSINESS_ACCOUNT_ID!) || !/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION!)) return null;
  if (env.WHATSAPP_WORKER_SECRET!.length < 32 || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!.length < 32) return null;
  return { token: env.WHATSAPP_ACCESS_TOKEN!, phoneId: env.WHATSAPP_PHONE_NUMBER_ID!, businessId: env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
    version: env.WHATSAPP_GRAPH_VERSION!, appSecret: env.WHATSAPP_APP_SECRET!, verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!, workerSecret: env.WHATSAPP_WORKER_SECRET!,
    language: env.WHATSAPP_TEMPLATE_LANGUAGE || "es_AR", intakeTemplate: env.WHATSAPP_INTAKE_TEMPLATE || "chetech_ingreso_equipo", deliveryTemplate: env.WHATSAPP_DELIVERY_TEMPLATE || "chetech_pago_garantia" };
}

export function normalizeDocumentRecipient(value: string) {
  let phone = value.replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = phone.slice(1);
  if (/^549\d{10}$/.test(phone)) return phone;
  if (/^54\d{10}$/.test(phone)) return `549${phone.slice(2)}`;
  return /^[1-8]\d{9}$/.test(phone) ? `549${phone}` : "";
}

export function equalSecret(value: string | null, expected: string) {
  if (!value || !expected) return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaSignature(raw: string, signature: string | null, secret: string) {
  if (!secret || !signature?.match(/^sha256=[a-f0-9]{64}$/)) return false;
  return equalSecret(signature, "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"));
}

export function buildDocumentTemplate(config: WhatsAppConfig, job: DocumentJob, mediaId: string, filename: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: job.recipient, type: "template", biz_opaque_callback_data: job.id,
    template: { name: job.kind === "intake" ? config.intakeTemplate : config.deliveryTemplate, language: { code: config.language }, components: [
      { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename } }] },
      { type: "body", parameters: [{ type: "text", text: String(job.snapshot.repair_access_customers?.full_name || "cliente").replace(/\s+/g, " ").trim().slice(0, 200) },
        { type: "text", text: String(job.snapshot.repair_number) }] }
    ] } };
}

export class WhatsAppDeliveryError extends Error {
  constructor(public code: string, public disposition: "retry" | "blocked" | "failed" | "uncertain") { super(code); }
}
