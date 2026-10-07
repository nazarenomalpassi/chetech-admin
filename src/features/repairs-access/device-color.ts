export function getRepairDeviceColor(device?: { color?: string | null; visual_condition?: string | null } | null) {
  if (device?.color != null) return device.color.trim();
  return device?.visual_condition?.match(/^Color:\s*(.+)$/i)?.[1]?.trim() ?? "";
}
