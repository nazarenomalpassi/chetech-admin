// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { TvBoardFinancialSummary, TvBoardRow } from "../model";
import { formatCurrency } from "@/lib/utils";

Object.assign(globalThis, { React });
const mutations = vi.hoisted(() => ({ changeSale: vi.fn(), refreshSale: vi.fn() }));
vi.mock("../claim-actions", () => ({ changeTvBoardSaleAction: mutations.changeSale, refreshTvBoardSaleStateAction: mutations.refreshSale }));
vi.mock("./board-filters", () => ({ BoardFilters: () => null }));
vi.mock("./board-table", () => ({ BoardTable: ({ onEdit, onSell, onStartClaim }: { onEdit: (id: string) => void; onSell: (id: string) => void; onStartClaim: (id: string) => void }) => <><button onClick={() => onEdit("1")}>Editar seleccionada</button><button onClick={() => onSell("1")}>Vender seleccionada</button><button onClick={() => onStartClaim("1")}>Reclamar seleccionada</button></> }));
vi.mock("./board-form-dialog", () => ({ BoardFormDialog: ({ open, board }: { open: boolean; board?: { model: string } | null }) => open ? <p>Ficha {board?.model ?? "nueva"}</p> : null }));
vi.mock("./board-sale-dialog", () => ({ BoardSaleDialog: ({ open, board }: { open: boolean; board?: { model: string } | null }) => open ? <p>Venta {board?.model ?? "perdida"}</p> : null }));
import { BoardsView } from "./boards-view";

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });
const board: TvBoardRow = {
  id: "1", brand: "BGH", model: "Main 123", boardType: "main", price: 100,
  acquisitionCost: null, releaseEvidence: "unsold", isActive: true, isSold: false,
  soldAt: null, netAmount: null, releaseDate: null, releasedAt: null, saleNotes: null,
  saleStatus: "unsold", createdAt: "2026-10-01", updatedAt: "2026-10-01",
  claimStatus: "none", claimOpenedAt: null, claimNotes: null, claimResolvedAt: null,
  claimResolutionNotes: null, version: 1, events: []
};
const summary: TvBoardFinancialSummary = {
  activeCount: 8, inactiveCount: 2, activeValue: 5000, salesNetAmount: 1800,
  pendingAmount: 500, heldAmount: 300, releasedAmount: 1000, cancelledAmount: 90,
  knownMargin: 650, incompleteCosts: 1
};
const claim: TvBoardRow = {
  ...board, id: "claim", model: "Reclamo global", isSold: true, isActive: false,
  soldAt: "2026-10-01", netAmount: 300, claimStatus: "open", saleStatus: "claim_open",
  releaseEvidence: "held", claimOpenedAt: "2026-10-19", claimNotes: "Revisar devolucion"
};

it.each(["edit", "sale"])("retains the open %s snapshot when results revalidate", (kind) => {
  const { rerender } = render(<BoardsView canManage boards={[board]} claims={[]} summary={summary} />);
  fireEvent.click(screen.getByRole("button", { name: kind === "edit" ? "Editar seleccionada" : "Vender seleccionada" }));
  rerender(<BoardsView canManage boards={[]} claims={[]} summary={summary} />);
  expect(screen.getByText(kind === "edit" ? "Ficha Main 123" : "Venta Main 123")).toBeTruthy();
});

it("uses the global financial summary even when inventory filters have no results", () => {
  render(<BoardsView canManage boards={[]} claims={[]} summary={summary} />);
  for (const [label, value] of [
    ["Neto de ventas", summary.salesNetAmount],
    ["Pendiente de confirmar", summary.pendingAmount],
    ["Dinero retenido", summary.heldAmount],
    ["Liberacion confirmada", summary.releasedAmount]
  ] as const) {
    expect(within(screen.getByText(label).parentElement!).getByRole("definition").textContent).toContain(formatCurrency(value));
  }
  expect(screen.getByText(/8 disponibles, 2 dadas de baja/)).toBeTruthy();
  expect(screen.getByText(/Incluye dinero retenido; excluye ventas anuladas/)).toBeTruthy();
  expect(screen.getByText(/Margen con costos conocidos:/).textContent).toContain(formatCurrency(650));
  expect(screen.getByText(/El margen excluye reclamos abiertos y ventas anuladas/)).toBeTruthy();
});

it("keeps all open claims visible independently of inventory results", () => {
  render(<BoardsView canManage boards={[]} claims={[claim]} summary={summary} />);
  const section = screen.getByRole("region", { name: "Reclamos / dinero retenido" });
  expect(within(section).getByText("BGH Reclamo global")).toBeTruthy();
  expect(within(section).getByText("Revisar devolucion")).toBeTruthy();
  expect(section.querySelector("strong")?.textContent).toBe(formatCurrency(300));
  expect(within(section).getByRole("button", { name: "Resolver reclamo" })).toBeTruthy();
  expect(section.querySelector("time")?.dateTime).toBe(claim.claimOpenedAt);
});

function openStartClaim() {
  const view = render(<BoardsView canManage boards={[{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending", netAmount: 300 }]} claims={[]} summary={summary} />);
  fireEvent.click(screen.getByRole("button", { name: "Reclamar seleccionada" }));
  return view;
}

function openResolution() {
  const view = render(<BoardsView canManage boards={[]} claims={[claim]} summary={summary} />);
  fireEvent.click(screen.getByRole("button", { name: "Resolver reclamo" }));
  return view;
}

function submitClaim() {
  const form = screen.getByRole("dialog").querySelector("form")!;
  expect(fireEvent.submit(form)).toBe(false);
}

async function refreshClaimState() {
  const refresh = screen.getByRole("button", { name: "Actualizar estado sin perder notas" }) as HTMLButtonElement;
  await waitFor(() => expect(refresh.disabled).toBe(false));
  fireEvent.click(refresh);
}

it("opens an accessible internal claim form with optional notes and the held amount", async () => {
  mutations.changeSale.mockResolvedValue({ success: true, message: "Reclamo registrado", recordVersion: 2 });
  openStartClaim();
  const dialog = screen.getByRole("dialog", { name: "Iniciar reclamo" });
  expect(within(dialog).getByText(/registro interno/i)).toBeTruthy();
  expect(within(dialog).getByText(/no abre.*MercadoLibre/i)).toBeTruthy();
  expect(dialog.textContent).toContain(formatCurrency(300));
  const notes = within(dialog).getByLabelText("Notas del reclamo (opcional)") as HTMLTextAreaElement;
  expect(notes.maxLength).toBe(1000);
  expect(notes.required).toBe(false);
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledWith({ id: "1", version: 1, operationId: expect.any(String), kind: "start_claim", notes: "" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("status").textContent).toContain("Reclamo registrado");
});

it("preserves draft and exact operation ID after a server rejection", async () => {
  mutations.changeSale.mockResolvedValue({ success: false, message: "La placa cambio en otro dispositivo" });
  openStartClaim();
  fireEvent.change(screen.getByLabelText("Notas del reclamo (opcional)"), { target: { value: "Revisar embalaje" } });
  submitClaim();
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Notas del reclamo (opcional)") as HTMLTextAreaElement).value).toBe("Revisar embalaje");
  const first = mutations.changeSale.mock.calls[0][0];
  await waitFor(() => expect(screen.getByRole("dialog").querySelector("form")?.getAttribute("aria-busy")).toBe("false"));
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledTimes(2));
  expect(mutations.changeSale.mock.calls[1][0]).toEqual(first);
});

it("assigns an operation ID per exact submitted payload, including when a draft is restored", async () => {
  mutations.changeSale.mockResolvedValue({ success: false, message: "Reintenta" });
  openStartClaim();
  const notes = screen.getByLabelText("Notas del reclamo (opcional)");
  for (const value of ["Primera nota", "Segunda nota", "Primera nota"]) {
    fireEvent.change(notes, { target: { value } });
    submitClaim();
    await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar reclamo" }) as HTMLButtonElement).disabled).toBe(false));
  }
  const calls = mutations.changeSale.mock.calls.map(([input]) => input);
  expect(calls).toHaveLength(3);
  expect(calls[0].operationId).not.toBe(calls[1].operationId);
  expect(calls[2].operationId).toBe(calls[0].operationId);
});

it("catches transport failures without losing resolution notes or the chosen outcome", async () => {
  mutations.changeSale.mockRejectedValue(new Error("Network failed"));
  openResolution();
  fireEvent.change(screen.getByLabelText("Resolucion"), { target: { value: "cancel_sale" } });
  fireEvent.change(screen.getByLabelText("Notas de resolucion (opcional)"), { target: { value: "Devolucion verificada" } });
  fireEvent.click(screen.getByLabelText("Confirmo anular esta venta sin reponer stock"));
  submitClaim();
  expect((await screen.findByRole("alert")).textContent).toMatch(/no se pudo confirmar/i);
  expect((screen.getByLabelText("Resolucion") as HTMLSelectElement).value).toBe("cancel_sale");
  expect((screen.getByLabelText("Notas de resolucion (opcional)") as HTMLTextAreaElement).value).toBe("Devolucion verificada");
  expect((screen.getByLabelText("Confirmo anular esta venta sin reponer stock") as HTMLInputElement).checked).toBe(true);
});

it("requires explicit cancellation confirmation and preserves the sale history without automatic restock", async () => {
  mutations.changeSale.mockResolvedValue({ success: true, message: "Venta anulada", recordVersion: 2 });
  openResolution();
  fireEvent.change(screen.getByLabelText("Resolucion"), { target: { value: "cancel_sale" } });
  expect(screen.getByRole("dialog").textContent).toMatch(/conserva el historial/i);
  expect(screen.getByRole("dialog").textContent).toMatch(/no repone stock automaticamente/i);
  submitClaim();
  expect(mutations.changeSale).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toMatch(/confirma/i);
  const confirmation = screen.getByLabelText("Confirmo anular esta venta sin reponer stock");
  expect(document.activeElement).toBe(confirmation);
  fireEvent.click(confirmation);
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledWith(expect.objectContaining({ id: "claim", version: 1, kind: "cancel_sale", notes: "" })));
});

it("resumes a claim only as pending, without confirming release or writing cash", async () => {
  mutations.changeSale.mockResolvedValue({ success: true, message: "Venta pendiente", recordVersion: 2 });
  openResolution();
  expect((screen.getByLabelText("Resolucion") as HTMLSelectElement).value).toBe("resume_sale");
  expect(screen.getByRole("dialog").textContent).toMatch(/no confirma.*liberacion/i);
  expect(screen.getByRole("dialog").textContent).toMatch(/no.*movimientos de caja/i);
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledWith(expect.objectContaining({ kind: "resume_sale" })));
});

it("blocks close, backdrop, Escape and duplicate submits while saving", async () => {
  let finish!: (value: { success: boolean; message: string }) => void;
  mutations.changeSale.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  openStartClaim();
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar reclamo" }));
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  submitClaim();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mutations.changeSale).toHaveBeenCalledOnce();
  await act(async () => { finish({ success: false, message: "Reintenta" }); });
  expect(screen.getByRole("alert").textContent).toBe("Reintenta");
});

it("retains an open claim snapshot and draft when filtered and global results revalidate", () => {
  const { rerender } = openResolution();
  fireEvent.change(screen.getByLabelText("Notas de resolucion (opcional)"), { target: { value: "No perder" } });
  rerender(<BoardsView canManage boards={[]} claims={[]} summary={summary} />);
  expect(screen.getByRole("dialog").textContent).toContain("BGH Reclamo global");
  expect((screen.getByLabelText("Notas de resolucion (opcional)") as HTMLTextAreaElement).value).toBe("No perder");
});

it("uses the returned record version to block stale claim actions until revalidation catches up", async () => {
  mutations.changeSale.mockResolvedValue({ success: true, message: "Reclamo resuelto", recordVersion: 12 });
  const { rerender } = openResolution();
  submitClaim();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect((screen.getByRole("button", { name: "Resolver reclamo" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<BoardsView canManage boards={[]} claims={[{ ...claim, version: 11 }]} summary={summary} />);
  expect((screen.getByRole("button", { name: "Resolver reclamo" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<BoardsView canManage boards={[]} claims={[{ ...claim, version: 12 }]} summary={summary} />);
  expect((screen.getByRole("button", { name: "Resolver reclamo" }) as HTMLButtonElement).disabled).toBe(false);
});

it("validates overlong notes before calling the action", () => {
  openStartClaim();
  const notes = screen.getByLabelText("Notas del reclamo (opcional)");
  fireEvent.change(notes, { target: { value: "x".repeat(1001) } });
  submitClaim();
  expect(mutations.changeSale).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toMatch(/1000/);
  expect(notes.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(notes);
});

it("protects a changed claim draft when discard is declined", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  openStartClaim();
  fireEvent.change(screen.getByLabelText("Notas del reclamo (opcional)"), { target: { value: "Conservar" } });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((screen.getByLabelText("Notas del reclamo (opcional)") as HTMLTextAreaElement).value).toBe("Conservar");
});

it("keeps claims readable but hides resolution for read-only users", () => {
  render(<BoardsView canManage={false} boards={[]} claims={[claim]} summary={summary} />);
  expect(screen.getByRole("region", { name: "Reclamos / dinero retenido" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Resolver reclamo" })).toBeNull();
});

it.each(["start", "resume", "cancel"] as const)("refreshes a conflicted %s draft explicitly and submits the returned version with a new key", async (operation) => {
  const starting = operation === "start";
  const id = starting ? board.id : claim.id;
  mutations.changeSale
    .mockResolvedValueOnce({ success: false, conflict: true, message: "La placa cambio en otro dispositivo" })
    .mockResolvedValueOnce({ success: true, message: "Cambio guardado", recordVersion: 9 });
  mutations.refreshSale.mockResolvedValue({ success: true, message: "Estado actualizado. Revisa antes de guardar.", state: { id, version: 8, status: starting ? "pending_release" : "claim_open" } });
  const { rerender } = starting ? openStartClaim() : openResolution();
  const notesLabel = starting ? "Notas del reclamo (opcional)" : "Notas de resolucion (opcional)";
  if (operation === "cancel") {
    fireEvent.change(screen.getByLabelText("Resolucion"), { target: { value: "cancel_sale" } });
    fireEvent.click(screen.getByLabelText("Confirmo anular esta venta sin reponer stock"));
  }
  fireEvent.change(screen.getByLabelText(notesLabel), { target: { value: "Conservar este borrador" } });
  submitClaim();
  await screen.findByRole("alert");
  const first = mutations.changeSale.mock.calls[0][0];
  const submitLabel = starting ? "Iniciar reclamo" : operation === "cancel" ? "Anular venta" : "Volver a pendiente";
  await waitFor(() => expect((screen.getByRole("button", { name: submitLabel }) as HTMLButtonElement).disabled).toBe(true));

  rerender(<BoardsView canManage boards={starting ? [{ ...board, isSold: true, soldAt: "2026-10-01", saleStatus: "pending_release", releaseEvidence: "pending", version: 7 }] : []} claims={starting ? [] : [{ ...claim, version: 7 }]} summary={summary} />);
  expect((screen.getByLabelText(notesLabel) as HTMLTextAreaElement).value).toBe("Conservar este borrador");
  expect(mutations.refreshSale).not.toHaveBeenCalled();
  await refreshClaimState();
  await waitFor(() => expect(mutations.refreshSale).toHaveBeenCalledWith(id));
  await waitFor(() => expect((screen.getByRole("button", { name: submitLabel }) as HTMLButtonElement).disabled).toBe(false));
  expect(mutations.changeSale).toHaveBeenCalledOnce();
  expect((screen.getByLabelText(notesLabel) as HTMLTextAreaElement).value).toBe("Conservar este borrador");
  if (!starting) expect((screen.getByLabelText("Resolucion") as HTMLSelectElement).value).toBe(operation === "cancel" ? "cancel_sale" : "resume_sale");
  if (operation === "cancel") expect((screen.getByLabelText("Confirmo anular esta venta sin reponer stock") as HTMLInputElement).checked).toBe(true);
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledTimes(2));
  expect(mutations.changeSale.mock.calls[1][0]).toEqual({
    id, version: 8, operationId: expect.any(String),
    kind: starting ? "start_claim" : operation === "cancel" ? "cancel_sale" : "resume_sale", notes: "Conservar este borrador"
  });
  expect(mutations.changeSale.mock.calls[1][0].operationId).not.toBe(first.operationId);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it.each([
  ["start", "released", /liberacion confirmada/i],
  ["start", "cancelled", /anulada/i],
  ["start", "claim_open", /reclamo abierto/i],
  ["start", "unsold", /sin venta/i],
  ["resolve", "pending_release", /pendiente de confirmar/i],
  ["resolve", "released", /liberacion confirmada/i],
  ["resolve", "cancelled", /anulada/i],
  ["resolve", "unsold", /sin venta/i]
] as const)("blocks a conflicted %s form when refreshed lifecycle is %s without discarding notes", async (mode, status, description) => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const starting = mode === "start";
  mutations.changeSale.mockResolvedValue({ success: false, conflict: true, message: "La placa cambio en otro dispositivo" });
  mutations.refreshSale.mockResolvedValue({ success: true, message: "Estado actualizado", state: { id: starting ? board.id : claim.id, version: 8, status } });
  if (starting) openStartClaim();
  else openResolution();
  const notesLabel = starting ? "Notas del reclamo (opcional)" : "Notas de resolucion (opcional)";
  fireEvent.change(screen.getByLabelText(notesLabel), { target: { value: "Notas que no se deben perder" } });
  submitClaim();
  await screen.findByRole("alert");
  await refreshClaimState();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(description));
  expect(screen.getByRole("alert").textContent).toMatch(/no se puede/i);
  expect(screen.getByRole("alert").textContent).toMatch(/notas.*conservan/i);
  await waitFor(() => expect((screen.getByRole("button", { name: starting ? "Iniciar reclamo" : "Volver a pendiente" }) as HTMLButtonElement).disabled).toBe(true));
  if (!starting) fireEvent.change(screen.getByLabelText("Resolucion"), { target: { value: "cancel_sale" } });
  expect(screen.getByRole("alert").textContent).toMatch(description);
  submitClaim();
  expect(mutations.changeSale).toHaveBeenCalledOnce();
  expect((screen.getByLabelText(notesLabel) as HTMLTextAreaElement).value).toBe("Notas que no se deben perder");
  await waitFor(() => expect((screen.getByRole("button", { name: "Cerrar reclamo" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar reclamo" }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it.each(["rejected", "transport", "missing state", "different board"] as const)("keeps the draft blocked and retryable after a %s refresh failure", async (failure) => {
  mutations.changeSale.mockResolvedValue({ success: false, conflict: true, message: "La placa cambio en otro dispositivo" });
  if (failure === "transport") mutations.refreshSale.mockRejectedValueOnce(new Error("Connection lost"));
  else mutations.refreshSale.mockResolvedValueOnce(failure === "rejected"
    ? { success: false, message: "No se pudo actualizar la placa" }
    : { success: true, message: "Estado actualizado", state: failure === "missing state" ? undefined : { id: "another-board", version: 8, status: "claim_open" } });
  mutations.refreshSale.mockResolvedValueOnce({ success: true, message: "Estado actualizado", state: { id: claim.id, version: 8, status: "claim_open" } });
  openResolution();
  fireEvent.change(screen.getByLabelText("Notas de resolucion (opcional)"), { target: { value: "Conservar tambien si falla la consulta" } });
  submitClaim();
  await screen.findByRole("alert");
  await refreshClaimState();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no se pudo actualizar/i));
  await waitFor(() => expect((screen.getByRole("button", { name: "Volver a pendiente" }) as HTMLButtonElement).disabled).toBe(true));
  expect((screen.getByLabelText("Notas de resolucion (opcional)") as HTMLTextAreaElement).value).toBe("Conservar tambien si falla la consulta");
  expect(mutations.changeSale).toHaveBeenCalledOnce();
  await refreshClaimState();
  await waitFor(() => expect((screen.getByRole("button", { name: "Volver a pendiente" }) as HTMLButtonElement).disabled).toBe(false));
  expect(mutations.refreshSale).toHaveBeenCalledTimes(2);
  expect(mutations.changeSale).toHaveBeenCalledOnce();
});

it.each(["start", "resolve"] as const)("explicitly disables each %s control during a pending mutation", async (mode) => {
  let finish!: (value: { success: boolean; message: string }) => void;
  mutations.changeSale.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  if (mode === "start") openStartClaim();
  else {
    openResolution();
    fireEvent.change(screen.getByLabelText("Resolucion"), { target: { value: "cancel_sale" } });
    fireEvent.click(screen.getByLabelText("Confirmo anular esta venta sin reponer stock"));
  }
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledOnce());
  try {
    const controls = screen.getByRole("dialog").querySelectorAll("select, textarea, input[type=checkbox]");
    expect(controls.length).toBe(mode === "start" ? 1 : 3);
    for (const control of controls) expect(control.hasAttribute("disabled")).toBe(true);
  } finally {
    await act(async () => { finish({ success: false, message: "Reintenta" }); });
  }
});

it.each(["start", "resolve"] as const)("keeps Tab and Shift+Tab inside the actual DialogShell while %s saving disables all controls", async (mode) => {
  let finish!: (value: { success: boolean; message: string }) => void;
  mutations.changeSale.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  if (mode === "start") openStartClaim();
  else openResolution();
  submitClaim();
  await waitFor(() => expect(mutations.changeSale).toHaveBeenCalledOnce());
  try {
    const dialog = screen.getByRole("dialog");
    dialog.focus();
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey })).toBe(false);
      expect(document.activeElement).toBe(dialog);
    }
  } finally {
    await act(async () => { finish({ success: false, message: "Reintenta" }); });
  }
});
