import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  LineChart,
  Monitor,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Wrench
} from "lucide-react";

export type SidebarItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

export const sidebarItems: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/productos", label: "Productos", icon: Boxes },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/gastos", label: "Gastos", icon: ReceiptText },
  { href: "/placas-tv" as Route, label: "Placas de Televisores", icon: Monitor },
  { href: "/sueldos" as Route, label: "Sueldo", icon: HandCoins },
  { href: "/cuotas" as Route, label: "Cuotas", icon: CreditCard },
  { href: "/caja", label: "Caja", icon: Landmark },
  { href: "/reportes" as Route, label: "Reportes", icon: LineChart },
  { href: "/reparaciones", label: "Pagos de reparaciones", icon: BadgeDollarSign },
  { href: "/reparaciones-access" as Route, label: "Reparaciones", icon: Wrench },
  { href: "/terciarizaciones" as Route, label: "Terciarizaciones", icon: Truck },
  { href: "/facturacion", label: "Facturacion", icon: FileText },
  { href: "/configuracion", label: "Configuracion", icon: Settings }
];
