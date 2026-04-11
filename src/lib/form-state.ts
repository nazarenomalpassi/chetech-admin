export type ActionResult = {
  success: boolean;
  message: string;
};

export function getStatusMessage(status?: string | string[] | null): ActionResult | null {
  const value = Array.isArray(status) ? status[0] : status;
  if (!value) return null;

  const messages: Record<string, ActionResult> = {
    sale_created: { success: true, message: "Venta guardada correctamente." },
    sale_updated: { success: true, message: "Venta actualizada correctamente." },
    sale_deleted: { success: true, message: "Venta eliminada y stock restaurado." },
    expense_created: { success: true, message: "Gasto guardado correctamente." },
    expense_updated: { success: true, message: "Gasto actualizado correctamente." },
    expense_deleted: { success: true, message: "Gasto eliminado correctamente." },
    repair_created: { success: true, message: "Reparacion guardada correctamente." },
    repair_updated: { success: true, message: "Reparacion actualizada correctamente." },
    repair_deleted: { success: true, message: "Reparacion eliminada correctamente." },
    invoice_created: { success: true, message: "Comprobante creado correctamente." },
    invoice_updated: { success: true, message: "Comprobante actualizado correctamente." },
    invoice_payment_added: { success: true, message: "Pago registrado correctamente." },
    invoice_payment_deleted: { success: true, message: "Pago eliminado correctamente." },
    invoice_voided: { success: true, message: "Comprobante anulado correctamente." }
  };

  return messages[value] ?? null;
}
