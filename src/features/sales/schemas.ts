import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  unitCost: z.coerce.number().nonnegative(),
  availableStock: z.coerce.number().int().nonnegative()
});

export const salePaymentSchema = z.object({
  method: z.string().min(1),
  amount: z.coerce.number().positive()
});

export const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Agregá al menos un producto"),
  payments: z.array(salePaymentSchema).min(1, "Ingresá al menos un método de pago"),
  notes: z.string().optional()
});
