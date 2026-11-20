/**
 * Pregunta "¿El cliente retiró el equipo?" y lista de cobradas sin retiro, con el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/cobros-retiro.tsx > tmp/qa/cobros-retiro.html
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request: string, ...rest: unknown[]) {
  if (request === "next/navigation")
    return { useRouter: () => ({ push() {}, refresh() {}, replace() {} }) };
  if (request.endsWith("pickup-actions")) return { markPaidOrdersPickedUpAction: async () => ({}) };
  return originalLoad.call(this, request, ...rest);
};
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PaidAwaitingPickupPanel
} = require("@/features/repairs/components/paid-awaiting-pickup-panel");
const { PickupQuestion } = require("@/features/repairs-access/components/pickup-question");
const { Card } = require("@/components/ui/card");
/* eslint-enable @typescript-eslint/no-require-imports */

Object.assign(globalThis, { React });

const css = readdirSync(".next/static/css")
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.resolve(".next/static/css", file)}">`)
  .join("");

const orders = [
  [
    "REP-000412",
    "María José Fernández de la Fuente",
    "Televisor Samsung UN55TU7000",
    "2026-10-28T15:00:00Z"
  ],
  ["REP-000431", "Luis Gómez", "Notebook Lenovo IdeaPad 3", "2026-11-04T15:00:00Z"],
  ["REP-000455", "Taller Hermanos Rodríguez", "Celular Motorola G54", null]
].map(([repairNumber, customerName, device, paidAt], index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  repairNumber,
  customerName,
  device,
  paidAt,
  intakeDate: "2026-10-20"
}));

const question = (value: "si" | "no" | null) => (
  <Card>
    <p className="mb-3 text-sm font-semibold">Cobro que salda la orden</p>
    <PickupQuestion value={value} onChange={() => {}} customerName="Ana Pérez" />
  </Card>
);

const body = renderToStaticMarkup(
  <main className="mx-auto grid max-w-3xl gap-4 p-4">
    <PaidAwaitingPickupPanel orders={orders} />
    {question(null)}
    {question("no")}
  </main>
).replace("<details", "<details open");

process.stdout.write(
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body class="bg-background text-foreground">${body}</body></html>`
);
