import { z } from "zod";

export const expenseSchema = z.object({
  id: z.string().uuid().optional(),
  expenseDate: z.string().min(1),
  type: z.string().min(1, "El tipo es obligatorio"),
  description: z.string().min(3, "La descripción es obligatoria"),
  amount: z.coerce.number().positive(),
  paymentMethod: z.string().min(1, "El método de pago es obligatorio"),
  impactsCash: z.boolean().default(true),
  observations: z.string().optional(),
  isVoided: z.boolean().default(false)
});
