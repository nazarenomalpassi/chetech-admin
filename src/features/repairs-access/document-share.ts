import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { normalizeWhatsAppPhone } from "./whatsapp";
import type { RepairDocumentData } from "./documents";

export const documentShareHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};
export const documentTokenPattern = /^[a-f0-9]{64}$/;
export const createDocumentToken = () => randomBytes(32).toString("hex");
export const hashDocumentToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function buildReceiptWhatsAppUrl({ phone, name, number, kind, link }: {
  phone: string; name: string; number: string; kind: "intake" | "delivery"; link: string;
}) {
  const recipient = normalizeWhatsAppPhone(phone);
  if (!/^549\d{10}$/.test(recipient)) throw new Error("Revisá el teléfono del cliente antes de enviar el comprobante.");
  const title = kind === "intake" ? "comprobante de ingreso de equipo" : "comprobante de pago y garantía";
  const url = new URL("https://web.whatsapp.com/send");
  url.searchParams.set("phone", recipient);
  url.searchParams.set("text", `Hola ${name.trim() || "cliente"}, te escribimos de CHETECH. Te compartimos el ${title} de la orden ${number}:\n${link}\nPodés abrir y descargar el PDF sin iniciar sesión. Conservá este mensaje. Gracias.`);
  return url.toString();
}

const text = z.string().max(30000);
const nullableText = text.nullable();
const money = z.number().finite().nonnegative();
// Only the already-approved customer document is stored and returned, never the raw order.
export const sharedDocumentSchema = z.object({
  kind: z.enum(["intake", "delivery"]), number: z.string().max(100), title: text, date: text, dateLabel: text,
  intakeDate: text, budgetRevision: z.null(), budgetSnapshotId: z.null(), amount: money.nullable(),
  sections: z.array(z.object({label: text, value: text})).max(40), notice: text, signatureLabel: z.literal(""),
  issuedAt: z.string().datetime({offset: true}),
  client: z.object({
    name: text, phone: text, address: text, equipment: text, model: text, serial: text, color: text,
    accessories: text, condition: text, fault: text, budgetDetail: text, budget: money.nullable(),
    finalTotal: money.nullable(), paidTotal: money, balance: money.nullable(), credit: money,
    payments: z.array(z.object({id: text, method: text, amount: money, date: nullableText})).max(1000),
    warranty: z.object({status: z.enum(["none","pending_delivery","active","expires_today","expired","needs_review"]), days: money.nullable(), startsOn: nullableText, expiresOn: nullableText, conditions: text}),
    policyStatus: nullableText, policy: nullableText
  })
});

export function toSharedDocument(data:RepairDocumentData) {
  if(!data.client)throw new Error("Faltan datos del comprobante.");
  const intake=data.kind==="intake",d=data.client;
  return sharedDocumentSchema.parse({...data,dateLabel:"",intakeDate:intake?data.date:"",budgetRevision:null,budgetSnapshotId:null,
    amount:intake?null:data.amount,sections:[],notice:"",signatureLabel:"",
    client:{...d,phone:intake?d.phone:"",address:intake?d.address:"",accessories:intake?d.accessories:"",
      condition:intake?d.condition:"",fault:intake?d.fault:"",budgetDetail:intake?"":d.budgetDetail,budget:null,
      finalTotal:intake?null:d.finalTotal,paidTotal:intake?0:d.paidTotal,balance:intake?null:d.balance,credit:intake?0:d.credit,
      payments:intake?[]:d.payments.map(p=>({...p,id:""})),
      warranty:intake?{status:"none",days:null,startsOn:null,expiresOn:null,conditions:""}:d.warranty.days===null?{...d.warranty,startsOn:null,expiresOn:null,conditions:""}:d.warranty,
      policyStatus:intake?d.policyStatus:null,policy:intake?d.policy:null}});
}
