// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getAllByRole("button", { name: /Eliminar/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText("Margen directo: Costo / neto incompleto")).toBeTruthy();
  });
});
