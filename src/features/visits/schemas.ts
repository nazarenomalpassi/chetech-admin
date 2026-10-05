import { z } from "zod";

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
    customerName: z.string().trim().min(1, "Ingresa el nombre del cliente"),
    customerPhone: z.string().trim().min(1, "Ingresa el celular"),
    address: z.string().trim().min(1, "Ingresa el domicilio"),
    visitDate: z.string().min(1, "Selecciona la fecha"),
    timeFrom: z.string().min(1, "Selecciona la hora desde"),
    timeTo: z.string().min(1, "Selecciona la hora hasta"),
    reason: z.string().trim().min(1, "Selecciona o escribe el motivo"),
    notes: z.string().optional(),
    status: z.enum(visitStatusValues).default("pendiente")
  })
  .superRefine((value, ctx) => {
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
  status: z.enum(visitStatusValues),
  notes: z.string().max(2000, "Las observaciones son demasiado largas").optional()
});

export type VisitFormValues = z.infer<typeof visitFormSchema>;
export type VisitStatusValue = (typeof visitStatusValues)[number];
