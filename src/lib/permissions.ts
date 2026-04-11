export const APP_ROLES = ["admin", "empleado"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function canManageCriticalData(role: AppRole) {
  return role === "admin";
}
