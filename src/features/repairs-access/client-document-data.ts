import { getWarrantyState } from "./warranty";
import type { RepairAccessOrderRecord } from "./queries";
import type { DocumentPaymentSnapshot } from "./document-payments";

export const INTAKE_REVIEW_POLICY = "Si el o los equipo/s no fueran retirado/s dentro de los 90 días, a partir de la fecha de ingreso a CHETECH, será considerado abandonado, perdiendo todo tipo de derecho de propiedad sobre el o los mismo/s, según Art. 2525, 2526, 2529, 3939 y 3940 del Código Civil, quedando la empresa facultada para disponer del o de los mismo/s. los cuales serán tomados en forma de pago por las reparaciones realizadas y/o en concepto de gastos por depósito y estadía.";

export type ClientDocumentSource = Pick<RepairAccessOrderRecord, "id" | "repairNumber" | "intakeDate" | "issueReported" | "deliveredAt" | "pickedUpAt" | "workPerformed" | "warrantyConditions"> & Partial<Pick<RepairAccessOrderRecord,
  "budgetAmount" | "hasBudgetAmount" | "budgetDetail" | "finalAmount" | "hasFinalAmount" | "hasWarranty" | "warrantyDays" | "warrantyStart" | "warrantyUntil" | "warrantyRequiresReview" | "status"
>> & {
  customer: Pick<RepairAccessOrderRecord["customer"], "fullName" | "phone"> & { address?: string };
  device: Pick<RepairAccessOrderRecord["device"], "deviceType" | "brand" | "model" | "color" | "serialNumber" | "accessoryDetails" | "visualCondition">;
};

function amount(value: number | undefined, present?: boolean) {
  if (present === false || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error("Revisa el importe de la orden antes de generar el documento.");
  return Math.round(value * 100) / 100;
}

export function buildClientDocumentData(order: ClientDocumentSource, kind: "intake" | "delivery", snapshot?: DocumentPaymentSnapshot) {
  const budget = amount(order.budgetAmount, order.hasBudgetAmount);
  const storedFinal = amount(order.finalAmount, order.hasFinalAmount);
  // Historical workshop orders initialize final_amount to zero. Match workshop read semantics;
  // an explicit linked financial charge (including zero) remains authoritative.
  const orderTotal = storedFinal !== null && storedFinal > 0 ? storedFinal : budget;
  const finalTotal = snapshot?.finalTotal ?? orderTotal;
  const payments = kind === "delivery" ? snapshot?.payments ?? [] : [];
  const paidCents = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const totalCents = finalTotal === null ? null : Math.round(finalTotal * 100);
  const warranty = getWarrantyState({ hasWarranty: order.hasWarranty === true, warrantyDays: order.warrantyDays ?? 0,
    pickedUpAt: order.pickedUpAt, repairStatus: order.status ?? "", warrantyStart: order.warrantyStart,
    warrantyUntil: order.warrantyUntil, requiresReview: order.warrantyRequiresReview });
  const validWarranty = ["active", "expires_today", "expired"].includes(warranty.code);
  return {
    name: order.customer.fullName, phone: order.customer.phone, address: order.customer.address || "No informado",
    equipment: [order.device.deviceType, order.device.brand].filter(Boolean).join(" / "),
    model: order.device.model || "No informado", serial: order.device.serialNumber || "No informado",
    color: order.device.color || "No informado", accessories: order.device.accessoryDetails || "No informados",
    condition: order.device.visualCondition || "No informado", fault: order.issueReported || "No informada",
    budgetDetail: kind === "delivery" ? order.budgetDetail || "Sin detalle de presupuesto registrado." : "",
    budget, finalTotal, payments, paidTotal: paidCents / 100,
    balance: totalCents === null ? null : Math.max(totalCents - paidCents, 0) / 100,
    credit: totalCents === null ? 0 : Math.max(paidCents - totalCents, 0) / 100,
    warranty: {
      status: warranty.code, days: validWarranty ? order.warrantyDays! : null,
      startsOn: validWarranty ? warranty.startsOn : null, expiresOn: validWarranty ? warranty.expiresOn : null,
      conditions: kind === "delivery" ? order.warrantyConditions || "Sin condiciones de cobertura registradas." : ""
    },
    policyStatus: kind === "intake" ? "Pendiente de revisión legal" : null,
    policy: kind === "intake" ? INTAKE_REVIEW_POLICY : null
  };
}

export type ClientDocumentData = ReturnType<typeof buildClientDocumentData>;
