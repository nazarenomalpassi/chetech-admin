import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  LineChart,
  MapPinned,
  Monitor,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Wrench
} from "lucide-react";

import { hasPermission, type AppPermission, type AppRole } from "@/lib/permissions";

export type SidebarItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  permission: AppPermission;
};

export const sidebarItems: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, permission: "dashboard.view" },
  { href: "/productos", label: "Productos", icon: Boxes, permission: "products.view" },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart, permission: "sales.manage" },
  { href: "/gastos", label: "Gastos", icon: ReceiptText, permission: "expenses.manage" },
  { href: "/visitas" as Route, label: "Visitas", icon: MapPinned, permission: "visits.view" },
  { href: "/placas-tv" as Route, label: "Placas de Televisores", icon: Monitor, permission: "boards.manage" },
  { href: "/sueldos" as Route, label: "Sueldo", icon: HandCoins, permission: "salaries.manage" },
  { href: "/pedidos" as Route, label: "Pedidos", icon: PackageCheck, permission: "orders.manage" },
  { href: "/cuotas" as Route, label: "Cuotas", icon: CreditCard, permission: "installments.manage" },
  { href: "/caja", label: "Caja", icon: Landmark, permission: "cash.manage" },
  { href: "/cambio-balance" as Route, label: "Transferencias entre cuentas", icon: ArrowRightLeft, permission: "balance.manage" },
  { href: "/reportes" as Route, label: "Reportes", icon: LineChart, permission: "reports.manage" },
  { href: "/reparaciones", label: "Pagos de reparaciones", icon: BadgeDollarSign, permission: "repairs.manage" },
  { href: "/reparaciones-access" as Route, label: "Reparaciones", icon: Wrench, permission: "repairs.view" },
  { href: "/terciarizaciones" as Route, label: "Terciarizaciones", icon: Truck, permission: "outsourcings.manage" },
  { href: "/facturacion", label: "Facturacion", icon: FileText, permission: "invoices.manage" },
  { href: "/configuracion", label: "Configuracion", icon: Settings, permission: "settings.manage" }
];

export function getSidebarItemsForRole(role: AppRole) {
  return sidebarItems.filter((item) => hasPermission(role, item.permission));
}

export function getSidebarGroupsForRole(role: AppRole) {
  const items = getSidebarItemsForRole(role);
  const groups = [
    { label: "Inicio", paths: ["/dashboard"] },
    { label: "Taller", paths: ["/reparaciones-access", "/visitas", "/terciarizaciones", "/pedidos"] },
    { label: "Comercial", paths: ["/productos", "/ventas", "/placas-tv"] },
    { label: "Finanzas", paths: ["/caja", "/cambio-balance", "/reparaciones", "/cuotas", "/gastos", "/sueldos", "/facturacion", "/reportes"] },
    { label: "Administracion", paths: ["/configuracion"] }
  ];
  return groups.map((group) => ({ label: group.label, items: group.paths.flatMap((path) => items.filter((item) => item.href === path)) })).filter((group) => group.items.length);
}
