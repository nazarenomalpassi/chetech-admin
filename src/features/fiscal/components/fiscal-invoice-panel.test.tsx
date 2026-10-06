// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FiscalInvoicePanel } from "./fiscal-invoice-panel";
import { snapshotFixture } from "../fixtures";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ready = { environment: "homologation", pointOfSale: 2, issuerCuit: "20123456786", today: "2026-10-05", ready: true, issues: [] };
describe("manual fiscal panel", () => {
  it("only reads configuration on mount and clearly disables issuance when setup is missing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ readiness: { ...ready, ready: false, pointOfSale: null, issues: ["Falta certificado ARCA", "PV00001 no es Web Services"] }, records: [] })));
    vi.stubGlobal("fetch", fetcher);
    render(<FiscalInvoicePanel invoiceId={snapshotFixture().invoiceId} />);
    await screen.findByText("Falta certificado ARCA");
    expect((screen.getByRole("button", { name: "Emitir factura C manualmente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).not.toBe("POST");
  });
  it("does not show an issuance button on the configuration-only panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ readiness: ready, records: [] }))));
    render(<FiscalInvoicePanel />);
    await screen.findByText(/Configuracion local validada/);
    expect(screen.queryByRole("button", { name: "Emitir factura C manualmente" })).toBeNull();
  });
  it("allows a native repair_access invoice and limits its fiscal concept to services", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ readiness: ready, sourceType: "repair_access", customerName: "Cliente sintetico", records: [] }))));
    render(<FiscalInvoicePanel invoiceId={snapshotFixture().invoiceId} />);
    await screen.findByText(/Configuracion local validada/);
    const button = screen.getByRole("button", { name: "Emitir factura C manualmente" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    const select = screen.getByLabelText("Concepto fiscal") as HTMLSelectElement;
    expect(Array.from(select.options).filter((option) => option.value && !option.disabled).map((option) => option.value)).toEqual(["2"]);
  });
  it("requires preview and explicit consent before posting a confirm", async () => {
    const preview = { requestId: "00000000-0000-4000-8000-000000000030", snapshotHash: "a".repeat(64), snapshot: snapshotFixture() };
    const fetcher = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/preview") ? preview : url.endsWith("/confirm") ? { id: preview.requestId, invoiceId: preview.snapshot.invoiceId,
        snapshot: preview.snapshot, snapshotHash: preview.snapshotHash, status: "accepted", number: 1,
        authorization: { cae: "12345678901234", expiresOn: "2026-10-15", number: 1, observationCodes: [] }, errorCodes: [] }
      : { readiness: ready, customerName: "Cliente", sourceType: "repair", records: [] })));
    vi.stubGlobal("fetch", fetcher);
    render(<FiscalInvoicePanel invoiceId={snapshotFixture().invoiceId} />);
    await screen.findByText(/Configuracion local validada/);
    fireEvent.click(screen.getByRole("button", { name: "Emitir factura C manualmente" }));
    fireEvent.change(screen.getByLabelText("Concepto fiscal"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Domicilio del receptor"), { target: { value: "Domicilio" } });
    fireEvent.change(screen.getByLabelText("Numero de documento"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByLabelText("Condicion frente al IVA"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Servicio desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Servicio hasta"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Vencimiento de pago"), { target: { value: "2026-10-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar factura C" }));
    const confirm = await screen.findByRole("button", { name: "Confirmar emision en homologacion" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/confirm"))).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Confirmo la emision manual de esta factura C"));
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText(/CAE: 12345678901234/)).toBeTruthy());
    const body = JSON.parse(fetcher.mock.calls.find(([url]) => String(url).endsWith("/confirm"))![1].body);
    expect(body.confirm).toBe(true);
    expect(body.requestId).toBe(preview.requestId);
  });
});
