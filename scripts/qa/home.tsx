/**
 * Inicio "Hoy en el taller" y menú lateral con datos de prueba, con el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/home.tsx > tmp/qa/home.html
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SidebarGroups } from "@/components/layout/sidebar-groups";
import { WorkshopTodaySection } from "@/features/dashboard/components/workshop-today-section";
import type { WorkshopToday } from "@/features/dashboard/workshop-today";
import { getSidebarGroupsForRole } from "@/lib/navigation";

Object.assign(globalThis, { React });

const css = readdirSync(".next/static/css")
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.resolve(".next/static/css", file)}">`)
  .join("");

const names = ["Alicia B.", "Silvio G.", "Alexis F.", "Lucio P.", "Marta R.", "Hugo S."];
const devices = ["Televisor LED TCL L32S6", "Lavarropas Drean Next", "Notebook Philco", "Radio"];

const today: WorkshopToday = {
  asOf: "2026-11-17",
  stages: { review: 21, waitingCustomer: 8, inProgress: 3, ready: 14, toReturn: 9 },
  attention: { open: 55, over30Days: 17, blockedParts: 2 },
  oldestReady: Array.from({ length: 8 }, (_, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    repairNumber: `REP-${String(120 + index * 7).padStart(6, "0")}`,
    intakeDate: `2026-0${7 + Math.floor(index / 3)}-1${index}`,
    readyOn: index < 3 ? null : `2026-${index < 6 ? "09" : "10"}-2${index}`,
    budgetAmount: 90000,
    finalAmount: 0,
    customerName: names[index % names.length],
    phone: index === 4 ? "" : "3510000000",
    device: devices[index % devices.length]
  }))
};

const visits = {
  todayCount: 2,
  pendingCount: 1,
  nextVisit: {
    id: "v1",
    customerName: "Visita de prueba",
    customerPhone: "",
    address: "Calle 123",
    visitDate: "2026-11-17",
    timeFrom: "15:00",
    timeTo: "16:00",
    reason: "Instalación de aire acondicionado",
    notes: "",
    status: "pendiente",
    createdAt: "2026-11-16T10:00:00Z"
  }
} as unknown as Parameters<typeof WorkshopTodaySection>[0]["visits"];

const sidebar = renderToStaticMarkup(
  <aside className="flex h-[744px] w-[236px] flex-col overflow-hidden rounded-2xl bg-graphite p-3 text-white">
    <div className="flex min-h-[80px] items-center justify-center border-b border-white/10 text-lg">
      Chetech
    </div>
    <nav className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
      <SidebarGroups groups={getSidebarGroupsForRole("admin")} pathname="/reparaciones-access" />
    </nav>
  </aside>
);

const main = renderToStaticMarkup(
  <WorkshopTodaySection canCreateOrder today={today} visits={visits} />
);

process.stdout.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">${css}</head>
<body class="admin-shell" style="padding:12px">
<div style="display:grid;grid-template-columns:236px minmax(0,1fr);gap:20px;align-items:start">
${sidebar}<main class="page-shell">${main}</main></div></body></html>`);
