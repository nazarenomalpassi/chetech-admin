import type { RepairAccessOrderRecord } from "./queries";

export type RepairDocumentKind = "intake" | "estimate" | "delivery";
export type RepairBudgetSnapshot = { id: string; orderId: string; revision: number; amount: number; detail: string; createdAt: string };
export type RepairDocumentData = {
  kind: RepairDocumentKind;
  number: string;
  title: string;
  date: string;
  dateLabel: string;
  intakeDate: string;
  budgetRevision: number | null;
  budgetSnapshotId: string | null;
  amount: number | null;
  sections: Array<{ label: string; value: string }>;
  notice: string;
  signatureLabel: string;
};
type Source = Pick<RepairAccessOrderRecord, "id" | "repairNumber" | "intakeDate" | "issueReported" | "deliveredAt" | "pickedUpAt" | "workPerformed" | "warrantyConditions"> & {
  customer: Pick<RepairAccessOrderRecord["customer"], "fullName" | "phone">;
  device: Pick<RepairAccessOrderRecord["device"], "deviceType" | "brand" | "model" | "serialNumber" | "accessoryDetails" | "visualCondition">;
};

export function buildRepairDocumentData(order: Source, kind: RepairDocumentKind, quote?: RepairBudgetSnapshot | null): RepairDocumentData {
  const deliveryDate = order.deliveredAt || order.pickedUpAt;
  if (kind === "delivery" && (!deliveryDate || !Number.isFinite(Date.parse(deliveryDate)))) throw new Error("Registra primero la entrega real del equipo.");
  if (kind === "estimate" && (!quote || quote.orderId !== order.id || !Number.isInteger(quote.revision) || quote.revision < 1
    || !Number.isFinite(quote.amount) || quote.amount < 0 || !Number.isFinite(Date.parse(quote.createdAt)))) {
    throw new Error("Guarda una revision valida del presupuesto antes de imprimirlo.");
  }
  const sections = [
    { label: "Cliente", value: `${order.customer.fullName}${order.customer.phone ? ` / ${order.customer.phone}` : ""}` },
    { label: "Equipo", value: [order.device.deviceType, order.device.brand, order.device.model, order.device.serialNumber ? `Serie ${order.device.serialNumber}` : ""].filter(Boolean).join(" / ") }
  ];
  if (kind === "intake") sections.push({ label: "Falla declarada", value: order.issueReported }, { label: "Accesorios recibidos", value: order.device.accessoryDetails || "No informados" }, { label: "Condicion de ingreso", value: order.device.visualCondition || "No informada" });
  if (kind === "estimate") sections.push({ label: "Trabajo presupuestado", value: quote!.detail || "Detalle no informado en esta revision" });
  if (kind === "delivery") sections.push({ label: "Trabajo realizado", value: order.workPerformed || "Consultar detalle de la orden" }, { label: "Condiciones de garantia", value: order.warrantyConditions || "Segun condiciones informadas del trabajo" });
  return {
    kind, number: order.repairNumber,
    title: kind === "intake" ? "Ingreso de equipo" : kind === "estimate" ? "Presupuesto de reparacion" : "Constancia de entrega",
    date: kind === "estimate" ? quote!.createdAt : kind === "delivery" ? deliveryDate! : order.intakeDate,
    dateLabel: kind === "estimate" ? "Fecha del presupuesto" : kind === "delivery" ? "Fecha de entrega" : "Fecha de ingreso",
    intakeDate: order.intakeDate, budgetRevision: kind === "estimate" ? quote!.revision : null,
    budgetSnapshotId: kind === "estimate" ? quote!.id : null, amount: kind === "estimate" ? quote!.amount : null, sections,
    notice: kind === "estimate"
      ? "El presupuesto informa el trabajo e importe propuestos; no acredita un pago. Su aceptacion se registra por separado. La firma de recepcion no autoriza el trabajo."
      : kind === "intake"
        ? "Comprobante de recepcion. Conserva el numero de orden para consultar el trabajo y retirar el equipo. No acredita un pago ni la entrega del equipo al cliente."
        : "Constancia de devolucion del equipo. Los cobros y la factura fiscal se documentan por separado. Esta constancia no acredita un pago.",
    signatureLabel: kind === "estimate" ? "Recepcion del presupuesto / firma" : kind === "intake" ? "Cliente / firma de ingreso" : "Persona que retira / firma"
  };
}
