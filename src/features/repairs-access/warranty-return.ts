import { z } from "zod";

export const warrantyReturnStatuses = ["pendiente_revision", "en_revision", "en_reparacion", "en_pruebas", "listo_para_retirar", "no_presenta_fallas", "sin_solucion", "retirado"] as const;
export type WarrantyReturnRecord = {
  id: string; orderId: string; repairNumber: string; customerName: string; deviceLabel: string;
  receivedOn: string; issueReported: string; accessories: string; conditionNotes: string;
  status: typeof warrantyReturnStatuses[number]; progress: string; resolution: string;
  closedAt: string | null; recipient: string | null; version: number; createdAt: string;
};
const id = z.string().uuid("No se pudo identificar el registro.");
const base = { id, version: z.coerce.number().int().positive("Actualiza la ficha antes de guardar."), operationId: id };
const text = z.string().trim().max(2000, "El texto no puede superar 2000 caracteres.").default("");
export const warrantyReturnStartSchema = z.object({
  ...base,
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const date = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
  }, "Ingresa una fecha valida."),
  issueReported: text.refine((s) => s.length >= 3, "Describe por que volvio el equipo."),
  accessories: text, conditionNotes: text, acknowledgeCoverage: z.boolean()
});
export const warrantyReturnSaveSchema = z.object({
  ...base, status: z.enum(warrantyReturnStatuses), progress: text, resolution: text, recipient: text, confirmDelivery: z.boolean()
});
