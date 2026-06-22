import { z } from "zod";

export const repairOutsourcingStatusValues = ["en_taller", "retirado", "cancelado"] as const;

const optionalTextField = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional()
);

export const repairOutsourcingSchema = z.object({
  id: z.string().uuid().optional(),
  repairAccessOrderId: z.string().uuid("Selecciona una orden de reparacion valida."),
  workshopName: z.string().trim().min(2, "Ingresa el lugar donde se llevo."),
  sentAt: z.string().min(1, "Ingresa la fecha en que se llevo."),
  notes: optionalTextField
});

export const repairOutsourcingRetrievedSchema = z.object({
  id: z.string().uuid("No se pudo identificar la terciarizacion."),
  retrievedAt: z.string().min(1, "Ingresa la fecha en que se busco."),
  notes: optionalTextField
});

export const repairOutsourcingCancelSchema = z.object({
  id: z.string().uuid("No se pudo identificar la terciarizacion."),
  notes: optionalTextField
});
