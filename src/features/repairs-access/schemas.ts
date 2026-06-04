import { z } from "zod";

export const repairAccessStatusValues = [
  "pendiente_revision",
  "en_revision",
  "presupuestado",
  "presupuestado_aceptado",
  "presupuestado_rechazado",
  "listo_para_retirar",
  "retirado",
  "sin_solucion"
] as const;

export const repairAccessIntakeSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  customerName: z.string().min(2, "Ingresa el nombre del cliente."),
  customerPhone: z.string().min(6, "Ingresa el telefono del cliente."),
  customerAlternatePhone: z.string().optional(),
  customerDni: z.string().optional(),
  customerEmail: z.string().email("Ingresa un email valido.").optional().or(z.literal("")),
  customerAddress: z.string().optional(),
  customerNotes: z.string().optional(),
  deviceType: z.string().min(2, "Ingresa el tipo de equipo."),
  deviceBrand: z.string().optional(),
  deviceModel: z.string().optional(),
  serialNumber: z.string().optional(),
  accessoryDetails: z.string().optional(),
  visualCondition: z.string().optional(),
  intakeDate: z.string().min(1, "Ingresa la fecha de ingreso."),
  issueReported: z.string().min(3, "Ingresa la falla declarada."),
  priority: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(repairAccessStatusValues).default("pendiente_revision")
});

export const repairAccessTechnicalSchema = z.object({
  id: z.string().uuid("No se pudo identificar la orden."),
  technicianName: z.string().optional(),
  technicalDiagnosis: z.string().optional(),
  repairProgress: z.string().optional(),
  internalObservations: z.string().optional(),
  usedParts: z.string().optional(),
  workPerformed: z.string().optional(),
  budgetAmount: z.coerce.number().min(0, "El presupuesto no puede ser negativo.").optional(),
  budgetDetail: z.string().optional(),
  budgetResponseNotes: z.string().optional(),
  finalAmount: z.coerce.number().min(0, "El monto final no puede ser negativo.").optional(),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  warrantyDays: z.coerce.number().int().min(0, "La garantia no puede ser negativa.").optional(),
  warrantyUntil: z.string().optional(),
  warrantyConditions: z.string().optional(),
  status: z.enum(repairAccessStatusValues),
  isPaid: z.coerce.boolean().default(false)
}).superRefine((data, ctx) => {
  if (data.isPaid && !data.paymentMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona un medio de pago para marcar la orden como cobrada.",
      path: ["paymentMethod"]
    });
  }

  if (data.isPaid && !data.finalAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ingresa el total final antes de marcar la orden como cobrada.",
      path: ["finalAmount"]
    });
  }
});
