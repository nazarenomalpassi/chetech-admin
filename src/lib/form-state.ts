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
    salary_created: { success: true, message: "Retiro de sueldo guardado correctamente." },
    salary_updated: { success: true, message: "Retiro de sueldo actualizado correctamente." },
    salary_deleted: { success: true, message: "Retiro de sueldo eliminado correctamente." },
    installment_sale_created: { success: true, message: "Venta en cuotas guardada correctamente." },
    installment_sale_cancelled: { success: true, message: "Venta en cuotas cancelada correctamente." },
    installment_updated: { success: true, message: "Cuota actualizada correctamente." },
    installment_paid: { success: true, message: "Cuota marcada como pagada e impactada en caja." },
    installment_cancelled: { success: true, message: "Cuota cancelada correctamente." },
    settings_saved: { success: true, message: "Ajustes de caja guardados correctamente." },
    goals_saved: { success: true, message: "Metas mensuales guardadas correctamente." },
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
