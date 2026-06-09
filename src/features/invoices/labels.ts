export function formatInvoiceSource(sourceType: string) {
  if (sourceType === "repair") return "Reparacion";
  if (sourceType === "sale") return "Venta de productos";
  if (sourceType === "manual") return "Manual";
  return sourceType;
}
