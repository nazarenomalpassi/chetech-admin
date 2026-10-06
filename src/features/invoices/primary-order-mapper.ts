function related(value: any) { return Array.isArray(value) ? value[0] : value; }

export function mapPrimaryOrderOption(order: any) {
  const customer = related(order.repair_access_customers);
  const device = related(order.repair_access_devices);
  const equipment = [device?.device_type, device?.brand, device?.model].filter(Boolean).join(" ") || "Equipo";
  const repairNumber = String(order.repair_number ?? order.order_number ?? order.id);
  const work = String(order.work_performed || order.budget_detail || order.issue_reported || "").trim();
  return {
    id: String(order.id), repairNumber,
    label: `${repairNumber} - ${customer?.full_name ?? "Cliente"} - ${equipment}`,
    customerName: String(customer?.full_name ?? ""), customerPhone: String(customer?.phone ?? ""),
    amount: [order.final_amount, order.approved_amount, order.budget_amount].map(Number).find((amount) => Number.isFinite(amount) && amount > 0) ?? 0,
    description: `Servicio tecnico ${repairNumber} - ${equipment}${work ? `. ${work}` : ""}`,
    notes: String(order.notes ?? "")
  };
}
