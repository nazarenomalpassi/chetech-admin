/**
 * Mesa de trabajo con datos de prueba, para revisar la tabla con el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/workshop-table.tsx > tmp/qa/workshop-table.html
 * Con QA_CARDS=1 muestra las tarjetas (vista principal).
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request: string, ...rest: unknown[]) {
  if (request === "next/navigation") {
    return {
      usePathname: () => "/reparaciones-access",
      useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
      useSearchParams: () => new URLSearchParams()
    };
  }
  return originalLoad.call(this, request, ...rest);
};
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  RepairAccessOrdersSection
} = require("@/features/repairs-access/components/repair-access-orders-section");
/* eslint-enable @typescript-eslint/no-require-imports */
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";

Object.assign(globalThis, { React });

const css = readdirSync(".next/static/css")
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.resolve(".next/static/css", file)}">`)
  .join("");

const today = new Date();
const daysAgo = (n: number) =>
  new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);

function order(
  index: number,
  status: string,
  intakeDays: number,
  extra: Partial<RepairAccessOrderRecord> = {}
): RepairAccessOrderRecord {
  return {
    id: `order-${index}`,
    repairNumber: `REP-${String(600 - index).padStart(6, "0")}`,
    status,
    intakeDate: daysAgo(intakeDays),
    budgetAmount: index % 3 === 0 ? 0 : 90000 + index * 7000,
    finalAmount: 0,
    budgetDetail: index === 3 ? "Cambio de placa fuente y limpieza general." : "",
    repairProgress: index === 4 ? "Se cambió el capacitor, falta probar 24 h." : "",
    issueReported: [
      "No enciende después de una tormenta.",
      "Falla de retroiluminación, se ve muy oscuro.",
      "No da imagen.",
      "Hace ruido al centrifugar y pierde agua por abajo."
    ][index % 4],
    isPaid: status === "retirado",
    paymentMethod: "efectivo",
    customer: {
      fullName: ["Alicia Ballatore", "Silvio Gautero", "Alexis Foresto", "Lucio Pereyra"][
        index % 4
      ],
      phone: "3571524353",
      alternatePhone: "",
      dni: ""
    },
    device: {
      deviceType: ["Televisor LED", "Lavarropas", "Notebook", "Radio"][index % 4],
      brand: ["TCL", "Drean", "Philco", "Stromberg"][index % 4],
      model: ["L32S6", "Next 8.12", "PLD32HS9A", "RD-7818"][index % 4],
      serialNumber: ""
    },
    warranty: { code: "none", label: "Sin garantía", expiresOn: null },
    ...extra
  } as RepairAccessOrderRecord;
}

const orders = [
  order(0, "listo_para_retirar", 1),
  order(1, "pendiente_revision", 0),
  order(2, "sin_solucion", 2),
  order(3, "presupuestado", 9),
  order(4, "en_revision", 45),
  order(5, "retirado", 60, { deliveredAt: daysAgo(3) } as Partial<RepairAccessOrderRecord>)
];

const noop = () => undefined;
const markup = renderToStaticMarkup(
  <main className="admin-main page-shell mx-auto max-w-[1180px] p-4">
    <RepairAccessOrdersSection
      canManageIntake
      initialPresentation={process.env.QA_CARDS ? "cards" : "table"}
      orders={orders}
      search=""
      statusFilter="todos"
      warrantyFilter="todos"
      onSearchChange={noop}
      onStatusFilterChange={noop}
      onWarrantyFilterChange={noop}
      onEdit={noop}
      onOpenDetail={noop}
      onNew={noop}
    />
  </main>
);

process.stdout.write(
  `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">${css}</head><body>${markup}</body></html>`
);
