import { buildClientDocumentData, type ClientDocumentData, type ClientDocumentSource } from "./client-document-data";
import type { DocumentPaymentSnapshot } from "./document-payments";

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
  issuedAt?: string;
  client?: ClientDocumentData;
};

export function buildRepairDocumentData(order: ClientDocumentSource, kind: RepairDocumentKind, quote?: RepairBudgetSnapshot | null, payments?: DocumentPaymentSnapshot): RepairDocumentData {
  const deliveryDate = order.pickedUpAt || order.deliveredAt;
  if (kind === "delivery" && (!deliveryDate || !Number.isFinite(Date.parse(deliveryDate)))) throw new Error("Registra primero la entrega real del equipo.");
  if (kind === "estimate" && (!quote || quote.orderId !== order.id || !Number.isInteger(quote.revision) || quote.revision < 1
    || !Number.isFinite(quote.amount) || quote.amount < 0 || !Number.isFinite(Date.parse(quote.createdAt)))) {
    throw new Error("Guarda una revision valida del presupuesto antes de imprimirlo.");
  }
  const sections = [
    { label: "Cliente", value: `${order.customer.fullName}${order.customer.phone ? ` / ${order.customer.phone}` : ""}` },
    { label: "Equipo", value: [order.device.deviceType, order.device.brand, order.device.model, order.device.serialNumber ? `Serie ${order.device.serialNumber}` : ""].filter(Boolean).join(" / ") }
  ];
  if (kind === "intake") {
    if (order.device.color) sections.push({ label: "Color", value: order.device.color });
    sections.push({ label: "Falla declarada", value: order.issueReported }, { label: "Accesorios recibidos", value: order.device.accessoryDetails || "No informados" }, { label: "Condicion de ingreso", value: order.device.visualCondition || "No informada" });
  }
  if (kind === "estimate") sections.push({ label: "Trabajo presupuestado", value: quote!.detail || "Detalle no informado en esta revision" });
  if (kind === "delivery") sections.push({ label: "Detalle del presupuesto", value: order.budgetDetail || "Sin detalle de presupuesto registrado." });
  const client = kind === "estimate" ? undefined : buildClientDocumentData(order, kind, payments);
  return {
    kind, number: order.repairNumber,
    title: kind === "intake" ? "Ingreso de equipo" : kind === "estimate" ? "Presupuesto de reparacion" : "Pago y garantía",
    date: kind === "estimate" ? quote!.createdAt : kind === "delivery" ? deliveryDate! : order.intakeDate,
    dateLabel: kind === "estimate" ? "Fecha del presupuesto" : kind === "delivery" ? "Fecha de entrega" : "Fecha de ingreso",
    intakeDate: order.intakeDate, budgetRevision: kind === "estimate" ? quote!.revision : null,
    budgetSnapshotId: kind === "estimate" ? quote!.id : null, amount: kind === "estimate" ? quote!.amount : kind === "delivery" ? client!.budget : null, sections, client,
    notice: kind === "estimate"
      ? "El presupuesto informa el trabajo e importe propuestos; no acredita un pago. Su aceptacion se registra por separado. La firma de recepcion no autoriza el trabajo."
      : kind === "intake"
        ? "Comprobante de recepcion. Conserva el numero de orden para consultar el trabajo y retirar el equipo. No acredita un pago ni la entrega del equipo al cliente."
        : "Comprobante interno. No válido como factura fiscal.",
    signatureLabel: kind === "estimate" ? "Recepcion del presupuesto / firma" : ""
  };
}
