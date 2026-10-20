import { z } from "zod";

export const tvBoardSaleCommandSchema = z.object({
  id: z.string().uuid("Selecciona una placa valida"),
  version: z.coerce.number().int().positive("Actualiza la ficha antes de continuar"),
  operationId: z.string().uuid("No se pudo identificar la operacion. Reabre la ficha"),
  kind: z.enum(["start_claim", "resume_sale", "cancel_sale", "confirm_release"]),
  notes: z.string().trim().max(1000, "Las notas pueden tener hasta 1000 caracteres").default("")
});

export type TvBoardSaleCommand = z.infer<typeof tvBoardSaleCommandSchema>;
