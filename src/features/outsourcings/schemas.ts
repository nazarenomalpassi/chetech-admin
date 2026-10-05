import { z } from "zod";
import { operationDateSchema } from "@/features/visits/schemas";

export const optionalOperationCost = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.coerce.number().finite().min(0, "El costo no puede ser negativo").max(9999999999.99).nullable()
);
const optionalDate = z.preprocess((value) => value === "" || value == null ? null : value, operationDateSchema.nullable());

export const repairOutsourcingStatusValues = ["en_taller", "retirado", "cancelado"] as const;

const optionalTextField = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional()
);

const outsourcingFields = z.object({
  id: z.string().uuid().optional(),
  repairAccessOrderId: z.string().uuid("Selecciona una orden de reparacion valida."),
  workshopName: z.string().trim().min(2, "Ingresa el lugar donde se llevo."),
  sentAt: operationDateSchema,
  responsibleName: z.string().trim().max(120).optional(),
  promisedAt: optionalDate,
  expectedCost: optionalOperationCost,
  notes: optionalTextField
});

export const repairOutsourcingSchema = outsourcingFields.refine(
  (value) => !value.promisedAt || value.promisedAt >= value.sentAt,
  { path: ["promisedAt"], message: "La fecha prometida no puede ser anterior al envio." }
);

export const repairOutsourcingFollowupSchema = z.object({
  id: z.string().uuid(),
  responsibleName: z.string().trim().min(1, "Indica un responsable").max(120),
  promisedAt: optionalDate,
  expectedCost: optionalOperationCost,
  notes: z.string().trim().max(2000).optional()
});

export const repairOutsourcingRetrievedSchema = z.object({
  id: z.string().uuid("No se pudo identificar la terciarizacion."),
  retrievedAt: operationDateSchema,
  actualCost: optionalOperationCost,
  qualityStatus: z.enum(["pendiente", "aprobado", "observado"]).default("pendiente"),
  qualityNotes: z.string().trim().max(2000).optional(),
  notes: optionalTextField
}).refine((value) => value.qualityStatus === "pendiente" || Boolean(value.qualityNotes), {
  path: ["qualityNotes"], message: "Describe las pruebas o las observaciones del control."
});

export const repairOutsourcingQualitySchema = z.object({
  id: z.string().uuid(),
  qualityStatus: z.enum(["aprobado", "observado"]),
  qualityNotes: z.string().trim().min(1, "Describe el control realizado").max(2000)
});

export const repairOutsourcingCancelSchema = z.object({
  id: z.string().uuid("No se pudo identificar la terciarizacion."),
  notes: optionalTextField
});
