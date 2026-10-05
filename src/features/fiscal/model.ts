import { z } from "zod";

export type FiscalEnvironment = "homologation" | "production";
export const IVA_CONDITIONS = [
  [1, "IVA Responsable Inscripto"], [4, "IVA Sujeto Exento"], [5, "Consumidor Final"],
  [6, "Responsable Monotributo"], [7, "Sujeto No Categorizado"], [10, "IVA Liberado - Ley 19.640"],
  [13, "Monotributista Social"], [15, "IVA No Alcanzado"], [16, "Monotributo Independiente Promovido"]
] as const;

export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validateCuit(raw: string) {
  const value = raw.replace(/-/g, "");
  if (!/^[1-9]\d{10}$/.test(value)) throw new Error("CUIT invalida.");
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const remainder = 11 - weights.reduce((sum, weight, index) => sum + weight * Number(value[index]), 0) % 11;
  const check = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  if (check !== Number(value[10])) throw new Error("Digito verificador de CUIT invalido.");
  return value;
}

export function isFiscalPointOfSaleAllowed(pointOfSale: number, environment: FiscalEnvironment) {
  return Number.isInteger(pointOfSale) && pointOfSale >= 1 && pointOfSale <= 99999 && (environment !== "production" || pointOfSale !== 1);
}

// Round decimal strings, not binary floating point. ARCA specifies half-even.
export function decimalCents(value: string | number) {
  const raw = String(value);
  if (!/^\d+(\.\d{1,10})?$/.test(raw)) throw new Error("Importe decimal invalido.");
  const [whole, fraction = ""] = raw.split(".");
  let cents = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  const tail = fraction.slice(2);
  if (tail && (tail[0] > "5" || (tail[0] === "5" && (/[1-9]/.test(tail.slice(1)) || cents % BigInt(2) !== BigInt(0))))) cents += BigInt(1);
  if (cents > BigInt(999999999999)) throw new Error("Importe fuera de rango.");
  return Number(cents);
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Fecha invalida.");

export const fiscalInputSchema = z.object({
  concept: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  issuedOn: date, serviceFrom: date.optional(), serviceTo: date.optional(), paymentDue: date.optional(),
  receiver: z.object({ name: z.string().trim().min(1).max(500), address: z.string().trim().min(1).max(500),
    documentType: z.union([z.literal(80), z.literal(96)]), documentNumber: z.string().regex(/^\d{7,11}$/),
    ivaCondition: z.number().int().refine((id) => IVA_CONDITIONS.some(([value]) => id === value)) }).strict()
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.concept !== 1 && (!value.serviceFrom || !value.serviceTo || !value.paymentDue)) issue("Indica periodo del servicio y vencimiento de pago.");
  if (value.serviceFrom && value.serviceTo && value.serviceFrom > value.serviceTo) issue("Periodo de servicio invalido.");
  if (value.paymentDue && value.paymentDue < value.issuedOn) issue("El vencimiento no puede ser anterior a la emision.");
  if (value.concept === 1 && (value.serviceFrom || value.serviceTo || value.paymentDue)) issue("Productos no llevan periodo de servicio.");
  if (value.receiver.documentType === 80) {
    try { validateCuit(value.receiver.documentNumber); } catch { issue("CUIT del receptor invalida."); }
  } else if (!/^\d{7,8}$/.test(value.receiver.documentNumber) || Number(value.receiver.documentNumber) === 0 || value.receiver.ivaCondition !== 5) {
    issue("DNI valido solo para Consumidor Final; para otras condiciones indica CUIT.");
  }
});

export type FiscalInput = z.infer<typeof fiscalInputSchema>;
export type FiscalIssuer = { cuit: string; name: string; address: string; grossIncome: string; activityStart: string };
export type FiscalDocument = {
  id: string; invoiceNumber: string; documentVersion: number; sourceType: string; repairId: string | null;
  saleId: string | null; repairAccessOrderId?: string | null; status: string; customerName: string; subtotal: number; discount: number; total: number;
  fiscalReference?: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
};
export type FiscalSnapshot = FiscalInput & {
  environment: FiscalEnvironment; issuer: FiscalIssuer; pointOfSale: number; voucherType: 11;
  invoiceId: string; invoiceNumber: string; documentCustomerName: string; documentVersion: number; sourceType: string;
  repairId: string | null; saleId: string | null; repairAccessOrderId: string | null; subtotalCents: number; discountCents: number; totalCents: number;
  items: Array<{ description: string; quantity: number; unitPriceCents: number; totalCents: number }>;
};

export function buildFiscalSnapshot(doc: FiscalDocument, raw: unknown,
  config: { environment: FiscalEnvironment; pointOfSale: number; issuer: FiscalIssuer }): FiscalSnapshot {
  const input = fiscalInputSchema.parse(raw);
  if (doc.status === "anulado" || !["sale", "repair", "repair_access"].includes(doc.sourceType) ||
    (doc.sourceType === "sale" && !doc.saleId) || (doc.sourceType === "repair" && !doc.repairId) ||
    (doc.sourceType === "repair_access" && !doc.repairAccessOrderId) || doc.fiscalReference) {
    throw new Error("Solo ventas o reparaciones vinculadas, no anuladas ni fiscalizadas, pueden emitirse.");
  }
  if (doc.sourceType === "repair_access" && input.concept !== 2) throw new Error("La REP nativa se emite como servicio (concepto 2), con periodo y vencimiento explicitos.");
  if (!isFiscalPointOfSaleAllowed(config.pointOfSale, config.environment)) throw new Error("Punto de venta Web Services invalido; PV00001 esta bloqueado en produccion.");
  const issuerCuit = validateCuit(config.issuer.cuit);
  if (input.receiver.documentType === 80 && input.receiver.documentNumber === issuerCuit) throw new Error("El receptor no puede ser el emisor configurado.");
  if (!Number.isInteger(doc.documentVersion) || doc.documentVersion < 1 || !doc.items.length || doc.items.length > 500) throw new Error("Documento incompleto.");
  const items = doc.items.map((item) => {
    if (!item.description.trim() || item.description.length > 10000 || !Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Detalle invalido.");
    return { description: item.description, quantity: item.quantity, unitPriceCents: decimalCents(item.unitPrice), totalCents: decimalCents(item.total) };
  });
  const subtotalCents = decimalCents(doc.subtotal), discountCents = decimalCents(doc.discount), totalCents = decimalCents(doc.total);
  if (subtotalCents !== items.reduce((sum, item) => sum + item.totalCents, 0) || totalCents !== subtotalCents - discountCents || totalCents <= 0) throw new Error("Importes del documento no coinciden. Recarga y revisa el comprobante.");
  return { ...input, environment: config.environment, pointOfSale: config.pointOfSale, issuer: { ...config.issuer, cuit: issuerCuit }, voucherType: 11,
    invoiceId: doc.id, invoiceNumber: doc.invoiceNumber, documentCustomerName: doc.customerName, documentVersion: doc.documentVersion, sourceType: doc.sourceType,
    repairId: doc.repairId, saleId: doc.saleId, repairAccessOrderId: doc.repairAccessOrderId ?? null, subtotalCents, discountCents, totalCents, items };
}

export type FiscalAuthorization = { cae: string; expiresOn: string; number: number; observationCodes: number[] };
export function fiscalInputFromSnapshot(s: FiscalSnapshot): FiscalInput {
  return fiscalInputSchema.parse({ concept: s.concept, issuedOn: s.issuedOn, serviceFrom: s.serviceFrom,
    serviceTo: s.serviceTo, paymentDue: s.paymentDue, receiver: s.receiver });
}
export type FiscalStatus = "claimed" | "prepared" | "submitting" | "uncertain" | "accepted" | "rejected";
export type FiscalRecord = { id: string; invoiceId: string; status: FiscalStatus; snapshot: FiscalSnapshot;
  snapshotHash: string; number: number | null; authorization: FiscalAuthorization | null; errorCodes: number[] };
