import { z } from "zod";

export const operationDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona una fecha valida").refine(
  (value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Selecciona una fecha valida"
);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Selecciona un horario valido");
const optionalId = z.preprocess((value) => value === "" || value == null ? null : value, z.string().uuid().nullable());

export const visitStatusValues = [
  "pendiente",
  "confirmada",
  "en_camino",
  "realizada",
  "cancelada"
] as const;

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export const visitFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
    customerName: z.string().trim().min(1, "Ingresa el nombre del cliente"),
    customerPhone: z.string().trim().min(1, "Ingresa el celular"),
    address: z.string().trim().min(1, "Ingresa el domicilio"),
    visitDate: operationDateSchema,
    timeFrom: timeSchema,
    timeTo: timeSchema,
    technicianId: optionalId,
    repairAccessOrderId: optionalId,
    reason: z.string().trim().min(1, "Selecciona o escribe el motivo"),
    notes: z.string().max(2000).optional(),
    status: z.enum(visitStatusValues).default("pendiente")
  })
  .superRefine((value, ctx) => {
    if (value.id && !value.expectedUpdatedAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedUpdatedAt"], message: "Falta la version de la visita. Actualiza antes de editar." });
    if (timeToMinutes(value.timeTo) <= timeToMinutes(value.timeFrom)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timeTo"],
        message: "La hora hasta debe ser posterior a la hora desde"
      });
    }
  });

export const visitStatusSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(visitStatusValues),
  notes: z.string().max(2000, "Las observaciones son demasiado largas").optional()
});

export type VisitFormValues = z.infer<typeof visitFormSchema>;
export type VisitStatusValue = (typeof visitStatusValues)[number];
