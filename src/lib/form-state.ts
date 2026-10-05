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
    warranty_settings_saved: {
      success: true,
      message: "Duracion predeterminada de garantia guardada correctamente."
    },
    goals_saved: { success: true, message: "Metas mensuales guardadas correctamente." },
    repair_created: { success: true, message: "Reparacion guardada correctamente." },
    repair_updated: { success: true, message: "Reparacion actualizada correctamente." },
    repair_deleted: { success: true, message: "Reparacion eliminada correctamente." },
    visit_created: { success: true, message: "Visita guardada correctamente." },
    visit_updated: { success: true, message: "Visita actualizada correctamente." },
    visit_deleted: { success: true, message: "Visita eliminada correctamente." },
    visit_status_updated: { success: true, message: "Estado de visita actualizado correctamente." },
    repair_access_created: { success: true, message: "Orden Access guardada correctamente." },
    repair_access_intake_updated: { success: true, message: "Ingreso de la orden actualizado correctamente." },
    repair_access_technical_updated: { success: true, message: "Seguimiento técnico actualizado correctamente." },
    repair_access_workshop_updated: { success: true, message: "Orden de taller actualizada correctamente." },
    repair_access_status_updated: { success: true, message: "Estado de la orden actualizado correctamente." },
    repair_customer_link_updated: { success: true, message: "Cuenta del cliente actualizada correctamente." },
    repair_customer_portal_updated: { success: true, message: "Informacion publicada para el cliente correctamente." },
    repair_access_updated: { success: true, message: "Orden Access actualizada correctamente." },
    repair_access_cancelled: { success: true, message: "Orden Access anulada correctamente, sin borrar el historial." },
    outsourcing_created: { success: true, message: "Terciarizacion guardada correctamente." },
    outsourcing_retrieved: { success: true, message: "Equipo marcado como buscado correctamente." },
    outsourcing_cancelled: { success: true, message: "Terciarizacion anulada correctamente, sin borrar el historial." },
    balance_transfer_created: { success: true, message: "Cambio de balance guardado correctamente." },
    balance_transfer_voided: { success: true, message: "Cambio de balance anulado con movimiento inverso." },
    invoice_created: { success: true, message: "Comprobante creado correctamente." },
    invoice_updated: { success: true, message: "Comprobante actualizado correctamente." },
    invoice_payment_added: { success: true, message: "Pago registrado correctamente." },
    invoice_payment_deleted: { success: true, message: "Pago eliminado correctamente." },
    invoice_voided: { success: true, message: "Comprobante anulado correctamente." }
  };

  return messages[value] ?? null;
}
