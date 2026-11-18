/**
 * Placas de televisores organizadas por cajas, con datos de prueba y el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/tv-boxes.tsx > tmp/qa/tv-boxes.html
 * QA_MODE=search muestra resultados del buscador; QA_MODE=box, una caja abierta.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mode = process.env.QA_MODE ?? "overview";
const params = new URLSearchParams(
  mode === "search" ? "search=eax" : mode === "box" ? "caja=2" : ""
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request: string, ...rest: unknown[]) {
  if (request === "next/navigation") {
    return {
      usePathname: () => "/placas-tv",
      useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
      useSearchParams: () => params
    };
  }
  return originalLoad.call(this, request, ...rest);
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { BoardsView } = require("@/features/tv-boards/components/boards-view");
/* eslint-enable @typescript-eslint/no-require-imports */
import type { TvBoardBox, TvBoardRow } from "@/features/tv-boards/model";

Object.assign(globalThis, { React });

const css = readdirSync(".next/static/css")
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.resolve(".next/static/css", file)}">`)
  .join("");

const base: TvBoardRow = {
  id: "1",
  brand: "LG",
  model: "EAX64",
  boardType: "main",
  boxId: null,
  price: 45000,
  acquisitionCost: null,
  releaseEvidence: "unsold",
  isActive: true,
  isSold: false,
  soldAt: null,
  netAmount: null,
  releaseDate: null,
  releasedAt: null,
  saleNotes: null,
  saleStatus: "unsold",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  claimStatus: "none",
  claimOpenedAt: null,
  claimNotes: null,
  claimResolvedAt: null,
  claimResolutionNotes: null,
  version: 1,
  events: []
};

const models: Array<[string, string, TvBoardRow["boardType"], number | null]> = [
  ["LG", "EAX64905501", "main", 1],
  ["Samsung", "BN44-00806A", "fuente", 1],
  ["TCL", "40-MS6488-MAB2HG", "placa_unica", 1],
  ["Philips", "715G8709", "fuente", 2],
  ["LG", "EAX67133404", "fuente", 2],
  ["Noblex", "TP.MS3663", "placa_unica", 2],
  ["Samsung", "BN41-02568B", "main", 2],
  ["BGH", "CV9203H-A42", "placa_unica", 3],
  ["Hisense", "RSAG7.820", "main", null]
];

const boards: TvBoardRow[] = models.map(([brand, model, boardType, box], index) => ({
  ...base,
  id: `b${index}`,
  brand,
  model,
  boardType,
  boxId: box ? `box-${box}` : null,
  price: 30000 + index * 5000
}));

function box(number: number, label: string | null): TvBoardBox {
  const stored = boards.filter((board) => board.boxId === `box-${number}`);
  const byType: TvBoardBox["byType"] = { fuente: 0, main: 0, tcom: 0, placa_unica: 0 };
  for (const board of stored) byType[board.boardType] += 1;
  return {
    id: `box-${number}`,
    number,
    label,
    createdAt: "2026-11-18",
    inStock: stored.length,
    available: stored.length,
    byType,
    preview: stored.slice(0, 4).map((board) => `${board.brand} ${board.model}`)
  };
}

const boxes = [
  box(1, "Estante de arriba"),
  box(2, "Debajo del mostrador"),
  box(3, null),
  box(4, null)
];
const sold: TvBoardRow = {
  ...base,
  id: "sold",
  brand: "Samsung",
  model: "BN44-00932",
  boardType: "fuente",
  isSold: true,
  isActive: false,
  soldAt: "2026-11-10",
  netAmount: 38000,
  releaseDate: "2026-11-20",
  saleStatus: "pending_release",
  releaseEvidence: "pending"
};

const view = (
  <BoardsView
    boards={
      mode === "search"
        ? boards.filter((board) => board.model.startsWith("EAX"))
        : mode === "box"
          ? boards.filter((board) => board.boxId === "box-2")
          : [...boards, sold]
    }
    boxes={boxes}
    boxesReady
    brands={[...new Set(boards.map((board) => board.brand))].map((brand) => ({
      value: brand.toLowerCase(),
      label: brand
    }))}
    canManage
    claims={[]}
    filters={mode === "search" ? { search: "eax" } : mode === "box" ? { caja: "2" } : {}}
    selectedBox={mode === "box" ? boxes[1] : null}
    summary={{
      activeCount: 9,
      inactiveCount: 0,
      activeValue: 450000,
      salesNetAmount: 38000,
      pendingAmount: 38000,
      heldAmount: 0,
      releasedAmount: 0,
      cancelledAmount: 0,
      knownMargin: 0,
      incompleteCosts: 1
    }}
    unboxedCount={1}
  />
);

const width = process.env.QA_MOBILE ? "390px" : "1180px";
process.stdout.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">${css}</head>
<body class="admin-shell" style="padding:12px"><main class="page-shell" style="max-width:${width}">${renderToStaticMarkup(view)}</main></body></html>`);
