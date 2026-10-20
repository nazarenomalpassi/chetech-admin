// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardTable } from "./board-table";
import type { TvBoardRow } from "../model";
import { markTvBoardReleasedAction } from "../actions";
Object.assign(globalThis, { React });
vi.mock("@/features/tv-boards/actions", () => ({ deleteTvBoardAction: vi.fn(), markTvBoardReleasedAction: vi.fn(), toggleTvBoardStatusAction: vi.fn() }));
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

  it("confirms a release with the optimistic version and stable retry key", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(markTvBoardReleasedAction).mockResolvedValue({ success: false, message: "No se pudo confirmar" });
    const pending: TvBoardRow = { ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending", netAmount: 80 };
    const props = { canManage: true, onEdit: vi.fn(), onSell: vi.fn(), onStartClaim: vi.fn() };
    const { rerender } = render(<BoardTable {...props} boards={[pending]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No se pudo confirmar"));
    const first = vi.mocked(markTvBoardReleasedAction).mock.calls[0][0];
    expect(first).toEqual({ id: "1", version: 3, operationId: expect.any(String) });
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Confirmar liberacion" })[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    await waitFor(() => expect(markTvBoardReleasedAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(markTvBoardReleasedAction).mock.calls[1][0]).toEqual(first);
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Confirmar liberacion" })[0] as HTMLButtonElement).disabled).toBe(false));
    rerender(<BoardTable {...props} boards={[{ ...pending, version: 4 }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    await waitFor(() => expect(markTvBoardReleasedAction).toHaveBeenCalledTimes(3));
    expect(vi.mocked(markTvBoardReleasedAction).mock.calls[2][0]).toEqual({ id: "1", version: 4, operationId: expect.not.stringContaining((first as { operationId: string }).operationId) });
  });

  it("catches a release transport failure and keeps an inline retry affordance", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(markTvBoardReleasedAction).mockRejectedValue(new Error("Connection lost"));
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending" }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/no se pudo confirmar/i);
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Confirmar liberacion" })[0] as HTMLButtonElement).disabled).toBe(false));
  });

  it("disables claim and edit while a release is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let finish!: (value: { success: boolean; message: string }) => void;
    vi.mocked(markTvBoardReleasedAction).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending" }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    expect((screen.getAllByRole("button", { name: "Iniciar reclamo" })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Editar" })[0] as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ success: true, message: "Confirmado" }); });
  });

  it("reports the actual release receipt version instead of guessing an increment", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(markTvBoardReleasedAction).mockResolvedValue({ success: true, message: "Confirmado", recordVersion: 42 });
    const onSaleChanged = vi.fn();
    render(<BoardTable canManage onEdit={vi.fn()} onSell={vi.fn()} onStartClaim={vi.fn()} onSaleChanged={onSaleChanged} boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending" }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar liberacion" })[0]);
    await waitFor(() => expect(onSaleChanged).toHaveBeenCalledWith("1", 42, "Confirmado"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
