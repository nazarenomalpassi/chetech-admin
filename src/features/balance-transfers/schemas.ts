import { z } from "zod";

import { BALANCE_TRANSFER_METHODS } from "@/features/balance-transfers/model";

export const balanceTransferMethodSchema = z.enum(BALANCE_TRANSFER_METHODS, {
  required_error: "Selecciona un medio."
});

export const balanceTransferSchema = z
  .object({
    fromPaymentMethod: balanceTransferMethodSchema,
    toPaymentMethod: balanceTransferMethodSchema,
    amount: z.coerce.number().positive("Ingresa un monto mayor a 0."),
    transferDate: z.string().min(1, "Selecciona la fecha."),
    description: z.string().trim().optional()
  })
  .refine((data) => data.fromPaymentMethod !== data.toPaymentMethod, {
    message: "El origen y el destino no pueden ser iguales.",
    path: ["toPaymentMethod"]
  });

export const voidBalanceTransferSchema = z.object({
  id: z.string().uuid("No se pudo identificar el cambio de balance."),
  reason: z.string().trim().optional()
});
