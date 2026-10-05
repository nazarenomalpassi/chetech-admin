const CLOSED_REPAIR_STATUSES = new Set(["retirado"]);

export function buildTechnicianRepairSummary(
  orders: Array<{ status: string; technicianId: string | null }>,
  userId: string
) {
  const activeOrders = orders.filter((order) => !CLOSED_REPAIR_STATUSES.has(order.status));

  return {
    active: activeOrders.length,
    assigned: activeOrders.filter((order) => order.technicianId === userId).length,
    pendingReview: activeOrders.filter((order) => order.status === "pendiente_revision").length,
    readyToPickup: activeOrders.filter((order) => order.status === "listo_para_retirar").length
  };
}
