// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TvBoardBox, TvBoardFinancialSummary, TvBoardRow } from "../model";

Object.assign(globalThis, { React });
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  deleteBox: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn(), replace: vi.fn() })
}));
vi.mock("../box-actions", () => ({ deleteTvBoardBoxAction: mocks.deleteBox }));
vi.mock("../claim-actions", () => ({
  changeTvBoardSaleAction: vi.fn(),
  refreshTvBoardSaleStateAction: vi.fn()
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  confirmThen: (_options: unknown, action: () => void) => action()
}));
vi.mock("@/components/ui/toaster", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));
vi.mock("./board-filters", () => ({ BoardFilters: () => <p>Buscador de placas</p> }));
vi.mock("./board-table", () => ({
  BoardTable: ({
    boards,
    boxNumbers
  }: {
    boards: TvBoardRow[];
    boxNumbers?: ReadonlyMap<string, number>;
  }) => (
    <ul aria-label="Placas listadas">
      {boards.map((board) => (
        <li key={board.id}>
          {board.model}
          {board.boxId && boxNumbers?.has(board.boxId)
            ? ` en caja ${boxNumbers.get(board.boxId)}`
            : " sin caja"}
        </li>
      ))}
    </ul>
  )
}));
vi.mock("./board-form-dialog", () => ({
  BoardFormDialog: ({
    open,
    defaultBoxId,
    boxes
  }: {
    open: boolean;
    defaultBoxId?: string | null;
    boxes?: TvBoardBox[];
  }) =>
    open ? (
      <p>
        Ficha nueva en {defaultBoxId ?? "ninguna"} con {boxes?.length ?? 0} cajas
      </p>
    ) : null
}));
vi.mock("./box-form-dialog", () => ({
  BoxFormDialog: ({ nextNumber, box }: { nextNumber: number; box: TvBoardBox | null }) => (
    <p>{box ? `Editando caja ${box.number}` : `Creando caja ${nextNumber}`}</p>
  )
}));
import { BoardsView } from "./boards-view";

const base: TvBoardRow = {
  id: "1",
  brand: "LG",
  model: "EAX123",
  boardType: "main",
  boxId: "box-1",
  price: 100,
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
const summary: TvBoardFinancialSummary = {
  activeCount: 2,
  inactiveCount: 0,
  activeValue: 200,
  salesNetAmount: 0,
  pendingAmount: 0,
  heldAmount: 0,
  releasedAmount: 0,
  cancelledAmount: 0,
  knownMargin: 0,
  incompleteCosts: 0
};
const box = (number: number, inStock: number, label: string | null = null): TvBoardBox => ({
  id: `box-${number}`,
  number,
  label,
  createdAt: "2026-11-18",
  inStock,
  available: inStock,
  byType: { main: inStock, fuente: 0, tcom: 0, placa_unica: 0 },
  preview: inStock ? ["LG EAX123"] : []
});
const boxes = [box(1, 1, "Estante de arriba"), box(2, 0)];

beforeEach(() => {
  mocks.deleteBox.mockResolvedValue({ success: true, message: "Caja 2 eliminada" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens on the boxes, with the finder on top and the next box number ready", () => {
  render(
    <BoardsView
      boards={[base]}
      boxes={boxes}
      boxesReady
      canManage
      claims={[]}
      summary={summary}
      unboxedCount={0}
    />
  );
  expect(screen.getByText("Buscador de placas")).toBeTruthy();
  const grid = screen.getByRole("list", { name: "Cajas" });
  expect(
    within(grid)
      .getByRole("link", { name: /Caja 1/ })
      .getAttribute("href")
  ).toBe("/placas-tv?caja=1");
  expect(within(grid).getByText("Estante de arriba")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ventas por Mercado Libre" })).toBeTruthy();
  expect(screen.getByText("Neto de ventas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Nueva caja" }));
  expect(screen.getByText("Creando caja 3")).toBeTruthy();
});

it("tells which box each search result is in", () => {
  render(
    <BoardsView
      boards={[base, { ...base, id: "2", model: "PSU900", boxId: null }]}
      boxes={boxes}
      boxesReady
      canManage
      claims={[]}
      filters={{ search: "lg" }}
      summary={summary}
    />
  );
  expect(screen.getByRole("heading", { name: "2 placas encontradas" })).toBeTruthy();
  const list = screen.getByRole("list", { name: "Placas listadas" });
  expect(within(list).getByText("EAX123 en caja 1")).toBeTruthy();
  expect(within(list).getByText("PSU900 sin caja")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Cajas" })).toBeNull();
});

it("shows one box with its boards and adds new boards straight into it", () => {
  render(
    <BoardsView
      boards={[base]}
      boxes={boxes}
      boxesReady
      canManage
      claims={[]}
      filters={{ caja: "1" }}
      selectedBox={boxes[0]}
      summary={summary}
    />
  );
  expect(screen.getByRole("heading", { name: "Caja 1" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Todas las cajas" }).getAttribute("href")).toBe(
    "/placas-tv"
  );
  // Una caja con placas no se puede eliminar.
  expect(screen.queryByRole("button", { name: "Eliminar caja" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Agregar placa" }));
  expect(screen.getByText("Ficha nueva en box-1 con 2 cajas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar caja" }));
  expect(screen.getByText("Editando caja 1")).toBeTruthy();
});

it("deletes an empty box and goes back to all boxes", async () => {
  render(
    <BoardsView
      boards={[]}
      boxes={boxes}
      boxesReady
      canManage
      claims={[]}
      filters={{ caja: "2" }}
      selectedBox={boxes[1]}
      summary={summary}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Eliminar caja" }));
  await waitFor(() => expect(mocks.deleteBox).toHaveBeenCalledWith("box-2"));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/placas-tv"));
  expect(mocks.toastSuccess).toHaveBeenCalledWith("Caja 2 eliminada");
});

it("keeps the previous layout when the database has no boxes yet", () => {
  render(<BoardsView boards={[base]} canManage claims={[]} summary={summary} />);
  expect(screen.queryByRole("button", { name: "Nueva caja" })).toBeNull();
  expect(screen.queryByRole("list", { name: "Cajas" })).toBeNull();
  expect(screen.getByText("EAX123 sin caja")).toBeTruthy();
});
