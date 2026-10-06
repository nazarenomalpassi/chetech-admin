export const APP_ROLES = ["admin", "tecnico"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
  "dashboard.view",
  "products.view",
  "products.manage",
  "repairs.view",
  "repairs.update",
  "repairs.manage",
  "visits.view",
  "visits.update",
  "visits.manage",
  "sales.manage",
  "expenses.manage",
  "boards.manage",
  "salaries.manage",
  "orders.manage",
  "installments.manage",
  "cash.manage",
  "balance.manage",
  "reports.manage",
  "outsourcings.manage",
  "invoices.manage",
  "settings.manage"
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

const TECHNICIAN_PERMISSIONS = new Set<AppPermission>([
  "dashboard.view",
  "products.view",
  "repairs.view",
  "repairs.update",
  "visits.view",
  "visits.update"
]);

const TECHNICIAN_ROUTES = [
  "/dashboard",
  "/productos",
  "/visitas",
  "/reparaciones-access",
  "/auth/sign-out"
] as const;

export function normalizeAppRole(value: unknown): AppRole | null {
  if (value === "admin") {
    return "admin";
  }

  if (value === "tecnico" || value === "empleado") {
    return "tecnico";
  }

  return null;
}

export function hasPermission(role: AppRole | null, permission: AppPermission) {
  return role !== null && (role === "admin" || TECHNICIAN_PERMISSIONS.has(permission));
}

export function canAccessPath(role: AppRole | null, pathname: string) {
  if (!role) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  return TECHNICIAN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function canManageCriticalData(role: AppRole | null) {
  return role === "admin";
}
