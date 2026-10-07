import { z } from "zod";

export const repairAccessStatusValues = [
  "pendiente_revision",
  "en_revision",
  "presupuestado",
  "presupuestado_aceptado",
  "presupuestado_rechazado",
  "en_reparacion",
  "en_pruebas",
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
  deviceColor: z.string().trim().max(80, "El color no puede superar 80 caracteres.").optional(),
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
  repairProgress: z
    .string()
    .max(2000, "El avance de reparación es demasiado largo.")
    .optional(),
  internalObservations: z.string().optional(),
  usedParts: z.string().optional(),
  workPerformed: z.string().optional(),
  budgetAmount: z.coerce.number().min(0, "El presupuesto no puede ser negativo.").optional(),
  budgetDetail: z
    .string()
    .max(2000, "El detalle del presupuesto es demasiado largo.")
    .optional(),
  budgetResponseNotes: z.string().optional(),
  finalAmount: z.coerce.number().min(0, "El monto final no puede ser negativo.").optional(),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  hasWarranty: z.boolean().default(false),
  warrantyDays: z.coerce.number().int().min(0, "La garantia no puede ser negativa.").default(0),
  pickedUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha de retiro valida.")
    .optional()
    .or(z.literal("")),
  warrantyConditions: z.string().optional(),
  status: z.enum(repairAccessStatusValues),
  isPaid: z.coerce.boolean().default(false)
}).superRefine((data, ctx) => {
  if (data.hasWarranty && data.warrantyDays <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ingresa una duracion mayor a cero para la garantia.",
      path: ["warrantyDays"]
    });
  }

  if (data.status === "retirado" && !data.pickedUpAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ingresa la fecha efectiva en que el cliente retiro el equipo.",
      path: ["pickedUpAt"]
    });
  }

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

export const repairAccessWorkshopSchema = z.object({
  id: z.string().uuid("No se pudo identificar la orden."),
  status: z.enum(repairAccessStatusValues),
  repairAmount: z.coerce.number().min(0, "El monto de la reparacion no puede ser negativo."),
  budgetDetail: z.string().max(2000, "El detalle del presupuesto es demasiado largo.").optional(),
  repairProgress: z.string().max(2000, "El avance tecnico es demasiado largo.").optional()
});

export const repairCustomerLinkSchema = z.object({
  orderId: z.string().uuid("No se pudo identificar la orden."),
  customerUserId: z.string().uuid("Selecciona una cuenta valida.").nullable()
});

export const repairCustomerPortalSchema = z.object({
  id: z.string().uuid("No se pudo identificar la orden."),
  publicProgress: z.string().max(2000, "El avance visible es demasiado largo.").optional(),
  publicNextStep: z.string().max(1000, "El proximo paso es demasiado largo.").optional(),
  customerActionRequired: z.boolean(),
  budgetVisibleToCustomer: z.boolean(),
  publicBudgetDescription: z
    .string()
    .max(2000, "La descripcion publica del presupuesto es demasiado larga.")
    .optional(),
  budgetValidUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de validez no es valida.")
    .optional()
    .or(z.literal("")),
  publishUpdate: z.boolean(),
  returnToOrders: z.boolean()
});
