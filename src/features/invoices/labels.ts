export function formatInvoiceSource(sourceType: string) {
  if (sourceType === "repair_access") return "Reparación (REP principal)";
  if (sourceType === "repair") return "Reparación";
  if (sourceType === "sale") return "Venta de productos";
  if (sourceType === "manual") return "Manual";
  return sourceType;
}
