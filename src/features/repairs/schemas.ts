import { z } from "zod";

export const repairStatusValues = [
  "ingresado",
  "en_diagnostico",
  "esperando_repuestos",
  "en_reparacion",
  "listo",
  "entregado",
  "cancelado"
] as const;

export const repairSchema = z.object({
  id: z.string().uuid().optional(),
  customerName: z.string().min(2),
  customerPhone: z.string().optional(),
  device: z.string().min(2),
  brand: z.string().optional(),
  model: z.string().optional(),
  issueDescription: z.string().min(3),
  diagnosis: z.string().optional(),
  estimatedPrice: z.coerce.number().nullable().optional(),
  finalPrice: z.coerce.number().nullable().optional(),
  internalCost: z.coerce.number().nullable().optional(),
  observations: z.string().optional(),
  status: z.enum(repairStatusValues).default("ingresado")
});

export const repairPaymentSchema = z.object({
  repairId: z.string().uuid(),
  method: z.string().min(1),
  amount: z.coerce.number().positive(),
  notes: z.string().optional()
});
