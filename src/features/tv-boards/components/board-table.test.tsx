// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardTable } from "./board-table";
Object.assign(globalThis, { React });
vi.mock("@/features/tv-boards/actions", () => ({ deleteTvBoardAction: vi.fn(), markTvBoardReleasedAction: vi.fn(), toggleTvBoardStatusAction: vi.fn() }));
afterEach(cleanup);
describe("board evidence labels", () => {
  it("does not equate a due estimate with actual release or net revenue with profit", () => {
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} boards={[{ id: "1", brand: "BGH", model: "Main", boardType: "main", price: 100, acquisitionCost: null, releaseEvidence: "estimated_due", isActive: false, isSold: true, soldAt: "2026-10-01", netAmount: 80, releaseDate: "2026-10-04", releasedAt: null, saleNotes: null, saleStatus: "released", createdAt: "2026-10-01" }]} />);
    expect(screen.getAllByText("Fecha prevista cumplida; sin confirmar")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Confirmar liberacion/ })).toHaveLength(2);
    expect(screen.queryByText("Dinero disponible")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Mas acciones" })[0]);
    expect((screen.getByRole("button", { name: "Eliminar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Margen directo: Costo / neto incompleto")).toBeTruthy();
  });
  it("keeps edit and sale actions visible for inventory and removes sale/release actions after confirmation", () => {
    const board = { id: "1", brand: "BGH", model: "Main", boardType: "main" as const, price: 100, acquisitionCost: 50, releaseEvidence: "unsold" as const, isActive: true, isSold: false, soldAt: null, netAmount: null, releaseDate: null, releasedAt: null, saleNotes: null, saleStatus: "unsold" as const, createdAt: "2026-10-01" };
    const onSell = vi.fn();
    const { rerender } = render(<BoardTable canManage onEdit={vi.fn()} onSell={onSell} boards={[board]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar venta" })[0]);
    expect(onSell).toHaveBeenCalledWith("1");
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
    rerender(<BoardTable canManage onEdit={vi.fn()} onSell={onSell} boards={[{ ...board, isSold: true, netAmount: 80, releaseEvidence: "confirmed", releasedAt: "2026-10-08" }]} />);
    expect(screen.queryByRole("button", { name: "Registrar venta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar liberacion" })).toBeNull();
  });
});
