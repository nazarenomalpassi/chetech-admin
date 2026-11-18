/**
 * Shell completo (menú lateral, barra superior, barra inferior del celular) y la sección de
 * Ventas con datos de prueba, con el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/shell.tsx > tmp/qa/shell.html
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

Object.assign(globalThis, { React });

const pathname = process.env.QA_PATH ?? "/ventas";
// usePathname fuera de Next: se simula con el módulo real reemplazado (require, orden garantizado).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request: string, ...rest: unknown[]) {
  if (request === "next/navigation") {
    return { usePathname: () => pathname, useRouter: () => ({ push() {}, refresh() {} }) };
  }
  return originalLoad.call(this, request, ...rest);
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { Sidebar } = require("@/components/layout/sidebar");
const { Topbar } = require("@/components/layout/topbar");
const { MobileNavigation } = require("@/components/layout/mobile-navigation");
const { SalesList } = require("@/features/sales/components/sales-list");
/* eslint-enable @typescript-eslint/no-require-imports */

const css = readdirSync(".next/static/css")
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.resolve(".next/static/css", file)}">`)
  .join("");

const sales = Array.from({ length: 6 }, (_, index) => ({
  id: `sale-${index}`,
  saleNumber: `V-00${index + 1}`,
  subtotal: 12000 * (index + 1),
  costTotal: index === 2 ? null : 5000 * (index + 1),
  profitTotal: index === 2 ? null : 7000 * (index + 1),
  soldAt: `2026-11-1${index}`,
  notes: "",
  payments: [
    { method: "efectivo", amount: 10000 },
    { method: "transferencia", amount: 2000 * (index + 1) }
  ],
  items: [
    {
      productId: "cable",
      productName: "Cable HDMI 2 m",
      quantity: 1,
      unitPrice: 12000,
      total: 12000
    }
  ],
  tvBoardId: null
}));

const main = renderToStaticMarkup(
  <SalesList
    canManageHistory
    message={null}
    pagination={{
      page: 1,
      pageSize: 25,
      total: 6,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false
    }}
    products={[{ id: "cable", label: "CAB-001 Cable HDMI", stock: 7, salePrice: 12000 }]}
    sales={sales}
  />
);

const desktop = `
<div class="admin-shell min-h-svh px-2 pt-2 pb-3 lg:py-3 lg:pr-5 lg:pl-2">
  <div class="grid w-full gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
    <div class="h-[744px] w-[236px]">${renderToStaticMarkup(<Sidebar role="admin" userName="Nazareno Malpassi" />)}</div>
    <div class="min-w-0 space-y-4">
      ${renderToStaticMarkup(<Topbar role="admin" />)}
      <main class="page-shell">${main}</main>
    </div>
  </div>
</div>`;

const mobile = `
<div class="admin-shell min-h-svh px-2 pt-2 pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
  ${renderToStaticMarkup(<MobileNavigation role="admin" userName="Nazareno Malpassi" />)}
  <main class="page-shell pt-3">${main}</main>
</div>`;

process.stdout
  .write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head>
<body>${process.env.QA_MOBILE ? mobile : desktop}</body></html>`);
