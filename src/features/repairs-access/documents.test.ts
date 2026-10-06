import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRepairDocumentData } from "./documents";
import { GET } from "@/app/api/repair-access/documents/[id]/route";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), mapOrder: vi.fn(), pdf: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("./queries", () => ({ mapOrder: mocks.mapOrder }));
vi.mock("./repair-document-pdf", () => ({ generateRepairDocumentPdf: mocks.pdf }));

const id = "00000000-0000-4000-8000-000000000357";
const order = {
  id, repairNumber: "REP-000357", intakeDate: "2026-09-01", issueReported: "No enciende", budgetAmount: 99999,
  budgetDetail: "Campo mutable obsoleto", deliveredAt: null, pickedUpAt: null, workPerformed: "Trabajo documentado",
  warrantyDays: 30, warrantyConditions: "Sobre el trabajo realizado", customer: { fullName: "Cliente prueba", phone: "3510000000" },
  device: { deviceType: "Televisor", brand: "Marca", model: "Modelo", serialNumber: "123", accessoryDetails: "Control", visualCondition: "Buen estado" },
  internalObservations: "NOTA PRIVADA", technicalDiagnosis: "DIAGNOSTICO INTERNO", paymentNotes: "NOTAS DE CAJA", isPaid: true
};
const quote = { id: "00000000-0000-4000-8000-000000000358", orderId: id, revision: 3, amount: 80000, detail: "Cambio de fuente - revision vigente", createdAt: "2026-10-05T01:30:00Z" };

describe("customer-facing repair documents", () => {
  it("uses the current quote snapshot and its real date/revision, not mutable fields or intake date", () => {
    const data = buildRepairDocumentData(order, "estimate", quote);
    expect(data.title).toBe("Presupuesto de reparacion");
    expect(data.amount).toBe(80000);
    expect(data.date).toBe(quote.createdAt);
    expect(data.dateLabel).toBe("Fecha del presupuesto");
    expect(data.budgetRevision).toBe(3);
    expect(data.intakeDate).toBe(order.intakeDate);
    expect(data.sections.find((section) => section.label === "Trabajo presupuestado")?.value).toBe(quote.detail);
    expect(JSON.stringify(data)).not.toContain(order.budgetDetail);
    expect(data.notice).toContain("no acredita un pago");
    expect(data.signatureLabel).toContain("Recepcion del presupuesto");
  });

  it("fails closed for absent, mismatched or invalid budget evidence instead of fabricating a dated estimate", () => {
    expect(() => buildRepairDocumentData(order, "estimate")).toThrow(/presupuesto/i);
    expect(() => buildRepairDocumentData(order, "estimate", { ...quote, orderId: "otra-orden" })).toThrow(/presupuesto/i);
    expect(() => buildRepairDocumentData(order, "estimate", { ...quote, createdAt: "fecha desconocida" })).toThrow(/presupuesto/i);
    expect(() => buildRepairDocumentData(order, "estimate", { ...quote, amount: NaN })).toThrow(/presupuesto/i);
  });

  it("keeps intake, estimate and actual delivery distinct and never includes private or financial notes", () => {
    const intake = buildRepairDocumentData(order, "intake");
    const delivery = buildRepairDocumentData({ ...order, pickedUpAt: "2026-10-06T15:14:00Z" }, "delivery");
    expect(intake.date).toBe(order.intakeDate);
    expect(intake.dateLabel).toBe("Fecha de ingreso");
    expect(intake.sections.some((section) => section.label === "Falla declarada")).toBe(true);
    expect(delivery.date).toBe("2026-10-06T15:14:00Z");
    expect(delivery.dateLabel).toBe("Fecha de entrega");
    expect(delivery.sections.some((section) => section.label === "Trabajo realizado")).toBe(true);
    expect(intake.amount).toBeNull();
    expect(delivery.amount).toBeNull();
    for (const kind of ["intake", "estimate", "delivery"] as const) {
      const data = buildRepairDocumentData({ ...order, pickedUpAt: "2026-10-06T15:14:00Z" }, kind, quote);
      expect(JSON.stringify(data)).not.toMatch(/NOTA PRIVADA|DIAGNOSTICO INTERNO|NOTAS DE CAJA|isPaid|paidTotal/);
    }
    expect(() => buildRepairDocumentData(order, "delivery")).toThrow(/entrega/i);
  });
});

describe("repair document read-only route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ role: "admin" });
    mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockResolvedValue({ data: { id, budget_revision: 3 }, error: null });
    mocks.mapOrder.mockReturnValue(order);
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: quote.id, order_id: id, revision: 3, amount: "80000.00", detail: quote.detail, created_at: quote.createdAt }, error: null });
    mocks.pdf.mockResolvedValue(Buffer.from("%PDF-fixture"));
  });

  const request = (kind: string) => GET(new Request(`https://example.test/api/repair-access/documents/${id}?kind=${kind}`), { params: Promise.resolve({ id }) });

  it("reads only the exact current quote under the authenticated client and never mutates a ledger", async () => {
    const response = await request("estimate");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.permission).toHaveBeenCalledWith("repairs.view");
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("repair_budget_versions");
    expect(mocks.select).toHaveBeenCalledWith("id,order_id,revision,amount,detail,created_at");
    expect(mocks.eq.mock.calls).toEqual([["order_id", id], ["revision", 3]]);
    expect(mocks.rpc.mock.calls.every(([name]) => name === "workshop_order_payload")).toBe(true);
    expect(mocks.pdf.mock.calls[0][0]).toMatchObject({ budgetRevision: 3, amount: 80000, date: quote.createdAt });
  });

  it("does not bypass admin budget access or silently fall back on denied/missing quote rows", async () => {
    mocks.permission.mockResolvedValue({ role: "technician" });
    expect((await request("estimate")).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue({ role: "admin" });
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await request("estimate")).status).toBe(409);
    mocks.single.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await request("estimate")).status).toBe(503);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("rejects a quote changed during reading rather than printing a stale current revision", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id, budget_revision: 3 }, error: null }).mockResolvedValueOnce({ data: { id, budget_revision: 4 }, error: null });
    expect((await request("estimate")).status).toBe(409);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("prints intake without querying budgets and refuses an unrecorded delivery", async () => {
    expect((await request("intake")).status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect((await request("delivery")).status).toBe(409);
  });

  it("rejects invalid requests and unversioned legacy estimates without attempting a fallback read", async () => {
    expect((await GET(new Request("https://example.test/documents?kind=intake"), { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(400);
    expect((await request("invalid-kind")).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { id, budget_revision: 0 }, error: null });
    expect((await request("estimate")).status).toBe(409);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("returns a safe generation error without a financial write or leaking internal details", async () => {
    mocks.pdf.mockRejectedValue(new Error("INTERNAL PRIVATE FAILURE"));
    const response = await request("intake");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("INTERNAL PRIVATE FAILURE");
    expect(mocks.rpc.mock.calls).toEqual([["workshop_order_payload", { p_order_id: id }]]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
