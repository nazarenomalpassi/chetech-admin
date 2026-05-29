import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  FileText,
  ReceiptText,
  Settings,
  ShoppingCart,
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
  { href: "/reparaciones", label: "Reparaciones", icon: Wrench },
  { href: "/reparaciones-access", label: "Reparaciones Access", icon: Wrench },
  { href: "/facturacion", label: "Facturacion", icon: FileText },
  { href: "/configuracion", label: "Configuracion", icon: Settings }
];
