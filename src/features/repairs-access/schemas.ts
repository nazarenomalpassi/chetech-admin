import { z } from "zod";

export const repairAccessStatusValues = [
  "ingresado",
  "en_revision",
  "presupuestado",
  "aprobado",
  "rechazado",
  "en_reparacion",
  "terminado",
  "entregado",
  "cobrado",
  "dado_de_baja"
] as const;

export const repairAccessOrderSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  customerName: z.string().min(2, "Ingresa el nombre del cliente."),
  customerPhone: z.string().optional(),
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
  technicalDiagnosis: z.string().optional(),
  budgetAmount: z.coerce.number().min(0, "El presupuesto no puede ser negativo.").optional(),
  approvedAmount: z.coerce.number().min(0, "El aprobado no puede ser negativo.").optional(),
  finalAmount: z.coerce.number().min(0, "El monto final no puede ser negativo.").optional(),
  paymentMethod: z.string().min(1, "Selecciona un medio de pago."),
  paymentNotes: z.string().optional(),
  warrantyUntil: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(repairAccessStatusValues).default("ingresado"),
  isPaid: z.coerce.boolean().default(false)
});

