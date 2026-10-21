// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardTable } from "./board-table";
import type { TvBoardRow } from "../model";
import { markTvBoardReleasedAction } from "../actions";
Object.assign(globalThis, { React });
vi.mock("@/features/tv-boards/actions", () => ({ deleteTvBoardAction: vi.fn(), markTvBoardReleasedAction: vi.fn(), toggleTvBoardStatusAction: vi.fn() }));
beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(false); });
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const board: TvBoardRow = {
  id: "1", brand: "BGH", model: "Main", boardType: "main", price: 100,
  acquisitionCost: 50, releaseEvidence: "unsold", isActive: true, isSold: false,
  soldAt: null, netAmount: null, releaseDate: null, releasedAt: null, saleNotes: null,
  saleStatus: "unsold", createdAt: "2026-10-01", updatedAt: "2026-10-01",
  claimStatus: "none", claimOpenedAt: null, claimNotes: null, claimResolvedAt: null,
  claimResolutionNotes: null, version: 3, events: []
};
describe("board evidence labels", () => {
  it("does not equate a due estimate with actual release or net revenue with profit", () => {
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...board, acquisitionCost: null, releaseEvidence: "estimated_due", isActive: false, isSold: true, soldAt: "2026-10-01", netAmount: 80, releaseDate: "2026-10-04", saleStatus: "pending_release" }]} />);
    expect(screen.getAllByText("Fecha prevista cumplida; sin confirmar")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Confirmar liberacion/ })).toHaveLength(2);
    expect(screen.queryByText("Dinero disponible")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Mas acciones" })[0]);
    expect((screen.getByRole("button", { name: "Eliminar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Margen directo: Costo / neto incompleto")).toBeTruthy();
  });
  it("keeps edit and sale actions visible for inventory and removes sale/release actions after confirmation", () => {
    const onSell = vi.fn();
    const { rerender } = render(<BoardTable canManage onEdit={vi.fn()} onSell={onSell} onStartClaim={vi.fn()} boards={[board]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar venta" })[0]);
    expect(onSell).toHaveBeenCalledWith("1");
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
    rerender(<BoardTable canManage onEdit={vi.fn()} onSell={onSell} onStartClaim={vi.fn()} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "released", netAmount: 80, releaseEvidence: "confirmed", releasedAt: "2026-10-08" }]} />);
    expect(screen.queryByRole("button", { name: "Registrar venta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar liberacion" })).toBeNull();
  });

  it("offers an explicit claim action only for an unreleased pending sale", () => {
    const onStartClaim = vi.fn();
    const { rerender } = render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={onStartClaim} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "estimated_due" }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Iniciar reclamo" })[0]);
    expect(onStartClaim).toHaveBeenCalledWith("1");
    rerender(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={onStartClaim} boards={[board, { ...board, id: "released", isSold: true, saleStatus: "released", releaseEvidence: "confirmed", releasedAt: "2026-10-08" }]} />);
    expect(screen.queryByRole("button", { name: "Iniciar reclamo" })).toBeNull();
  });

  it.each([
    ["open", "claim_open", "held", "Dinero retenido"],
    ["cancelled", "cancelled", "cancelled", "Venta anulada"]
  ] as const)("does not release or restart a %s claim or show a realized margin", (claimStatus, saleStatus, releaseEvidence, label) => {
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", netAmount: 80, claimStatus, saleStatus, releaseEvidence }]} />);
    expect(screen.getAllByText(label)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Confirmar liberacion" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar reclamo" })).toBeNull();
    expect(screen.queryByText(/Margen directo:.*30/)).toBeNull();
    expect(screen.getAllByText("Excluida del margen directo")).toHaveLength(2);
  });

  it("makes sale events available through a compact history disclosure", () => {
    render(<BoardTable canManage={false} onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...board, events: [{ id: "event", kind: "resume_sale", notes: "Revision terminada", netAmount: 80, createdAt: "2026-10-19" }] }]} />);
    const history = screen.getAllByText("Ver historial (1)")[0].closest("details")!;
    expect(history).toBeTruthy();
    expect(history.textContent).toContain("Venta devuelta a pendiente");
    expect(history.textContent).toContain("Revision terminada");
    expect(history.querySelector("time")?.dateTime).toBe("2026-10-19");
  });

  it("opens an account confirmation dialog without submitting a release", () => {
    const pending: TvBoardRow = { ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending", netAmount: 80 };
    const props = { canManage: true, onEdit: vi.fn(), onSell: vi.fn(), onStartClaim: vi.fn() };
    render(<BoardTable {...props} boards={[pending]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    expect(screen.getByRole("dialog", { name: "Confirmar liberacion" })).toBeTruthy();
    expect(markTvBoardReleasedAction).not.toHaveBeenCalled();
    expect((screen.getAllByRole("button", { name: "Iniciar reclamo" })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Editar" })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports the actual release receipt version instead of guessing an increment", async () => {
    vi.mocked(markTvBoardReleasedAction).mockResolvedValue({ success: true, message: "Confirmado", recordVersion: 42 });
    const onSaleChanged = vi.fn();
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} onSaleChanged={onSaleChanged} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", netAmount: 80, saleStatus: "pending_release", releaseEvidence: "pending" }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Cuenta de destino"), { target: { value: "nx" } });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(onSaleChanged).toHaveBeenCalledWith("1", 42, "Confirmado"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the generated sale and destination without assuming legacy releases were posted", () => {
    const released: TvBoardRow = { ...board, isSold: true, soldAt: "2026-10-01", releasedAt: "2026-10-21", saleStatus: "released", releaseEvidence: "confirmed" };
    const { rerender } = render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...released, linkedSale: { id: "sale", number: "V-0123", method: "nx" } }]} />);
    expect(screen.getAllByText(/V-0123.*NX SANTI/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Confirmar liberacion" })).toBeNull();
    rerender(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[released]} />);
    expect(screen.getAllByText("Liberacion historica sin venta vinculada")).toHaveLength(2);
    expect(screen.queryByText(/NX SANTI/)).toBeNull();
  });
});
