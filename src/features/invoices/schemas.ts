import { z } from "zod";

export const invoiceSourceValues = ["manual", "repair", "sale"] as const;
export const invoiceStatusValues = ["pendiente", "parcial", "pagado", "anulado"] as const;

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "El item necesita descripcion"),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
  unitPrice: z.coerce.number().min(0, "El precio no puede ser negativo"),
  productId: z.string().uuid().nullable().optional(),
  repairId: z.string().uuid().nullable().optional()
});

export const invoiceFormSchema = z.object({
  id: z.string().uuid().optional(),
  customerName: z.string().min(1, "El cliente es obligatorio"),
  customerPhone: z.string().optional(),
  sourceType: z.enum(invoiceSourceValues),
  repairId: z.string().uuid().nullable().optional(),
  saleId: z.string().uuid().nullable().optional(),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "Agrega al menos un item")
});
