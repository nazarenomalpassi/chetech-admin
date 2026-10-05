import { z } from "zod";
import { calculateInvoiceAmounts } from "./document-model";

export const invoiceSourceValues = ["manual", "repair", "repair_access", "sale"] as const;
export const invoiceStatusValues = ["pendiente", "parcial", "pagado", "anulado"] as const;

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "El item necesita descripcion").max(10000),
  quantity: z.coerce.number().finite().positive("La cantidad debe ser mayor a 0").max(9999999999.99).multipleOf(0.01),
  unitPrice: z.coerce.number().finite().min(0, "El precio no puede ser negativo").max(9999999999.99).multipleOf(0.01),
  productId: z.string().uuid().nullable().optional(),
  repairId: z.string().uuid().nullable().optional()
});

export const invoiceFormSchema = z.object({
  id: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  customerName: z.string().trim().min(1, "El cliente es obligatorio").max(500),
  customerPhone: z.string().optional(),
  sourceType: z.enum(invoiceSourceValues),
  repairId: z.string().uuid().nullable().optional(),
  repairAccessOrderId: z.string().uuid().nullable().optional(),
  saleId: z.string().uuid().nullable().optional(),
  discount: z.coerce.number().finite().min(0).multipleOf(0.01).default(0),
  notes: z.string().max(10000).optional(),
  fiscalProvider: z.string().trim().max(100).optional(),
  fiscalReference: z.string().trim().max(300).optional(),
  fiscalIssuedAt: z.string().datetime({ offset: true }).optional(),
  items: z.array(invoiceItemSchema).min(1, "Agrega al menos un item").max(500)
}).superRefine((input, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (input.sourceType === "repair" && !input.repairId) issue("repairId", "Selecciona la reparacion vinculada.");
  if (input.sourceType === "repair_access" && !input.repairAccessOrderId) issue("repairAccessOrderId", "Selecciona la REP principal vinculada.");
  if (input.sourceType === "sale" && !input.saleId) issue("saleId", "Selecciona la venta vinculada.");
  if (input.id && !input.expectedVersion) issue("expectedVersion", "Recarga el comprobante antes de editar.");
  if (Boolean(input.fiscalProvider) !== Boolean(input.fiscalReference)) issue("fiscalReference", "Indica proveedor y referencia fiscal externa juntos.");
  try { calculateInvoiceAmounts(input.items, input.discount); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Revisa los importes del comprobante.";
    issue(message.includes("descuento") ? "discount" : "items", message);
  }
});
