import { describe, expect, it } from "vitest";
import { buildRepairDocumentData } from "./documents";
import { readDocumentPayments } from "./document-payments";

export const clientOrder = {
  id: "00000000-0000-4000-8000-000000000357", repairNumber: "REP-000357",
  intakeDate: "2026-10-10", issueReported: "Sin imagen", budgetDetail: "Cambio de tiras LED.\nIncluye colocación y pruebas.",
  budgetAmount: 150000, hasBudgetAmount: true, finalAmount: 150000, hasFinalAmount: true,
  deliveredAt: "2026-10-21T12:00:00Z", pickedUpAt: "2026-10-20T00:00:00-03:00", status: "retirado",
  workPerformed: "NOTA TECNICA DIFERENTE", hasWarranty: true, warrantyDays: 90,
  warrantyStart: "2026-10-20", warrantyUntil: "2027-01-18", warrantyConditions: "Cubre el trabajo realizado.",
  warrantyRequiresReview: false, isPaid: true, paymentNotes: "NOTA PRIVADA",
  customer: { fullName: "María Ejemplo", phone: "3571000000", address: "Calle de ejemplo 123", dni: "NO PUBLICAR" },
  device: { deviceType: "Televisor", brand: "Samsung", model: "UN43", color: "Negro", serialNumber: "EJEMPLO-123", accessoryDetails: "Control remoto y cable", visualCondition: "Marcas en gabinete" }
};
const payment = { id: "p1", method: "EFECTIVO", amount: "50000.00", payment_date: "2026-10-10", created_at: "2026-10-10T14:00:00Z" };

describe("approved digital customer documents", () => {
  it("uses the order budget verbatim, with one total and no work/parts breakdown", () => {
    const data = buildRepairDocumentData(clientOrder, "delivery");
    expect(data.title).toBe("Pago y garantía");
    expect(data.client?.budgetDetail).toBe(clientOrder.budgetDetail);
    expect(data.amount).toBe(150000);
    expect(data.date).toBe(clientOrder.pickedUpAt);
    expect(JSON.stringify(data)).not.toMatch(/NOTA TECNICA|NOTA PRIVADA|NO PUBLICAR/);
    expect(data.signatureLabel).toBe("");
  });
  it("keeps intake fields and the approved legal-review warning, without a signature or DNI", () => {
    const data = buildRepairDocumentData(clientOrder, "intake");
    expect(data.client?.address).toBe(clientOrder.customer.address);
    expect(data.client?.accessories).toBe(clientOrder.device.accessoryDetails);
    expect(data.client?.color).toBe("Negro");
    expect(data.client?.policyStatus).toBe("Pendiente de revisión legal");
    expect(data.signatureLabel).toBe("");
    expect(JSON.stringify(data)).not.toContain("NO PUBLICAR");
  });
  it("does not manufacture payments from isPaid and preserves original warranty dates", () => {
    const data = buildRepairDocumentData(clientOrder, "delivery");
    expect(data.client?.paidTotal).toBe(0);
    expect(data.client?.balance).toBe(150000);
    expect(data.client?.warranty).toMatchObject({ startsOn: "2026-10-20", expiresOn: "2027-01-18", days: 90 });
    const none = buildRepairDocumentData({ ...clientOrder, hasWarranty: false }, "delivery");
    expect(none.client?.warranty.days).toBeNull();
    const invalid = buildRepairDocumentData({ ...clientOrder, warrantyUntil: "2027-03-01" }, "delivery");
    expect(invalid.client?.warranty).toMatchObject({ status: "needs_review", startsOn: null, expiresOn: null });
  });
  it("does not turn an absent budget into a zero quote and permits explicit no-charge work", () => {
    expect(buildRepairDocumentData({ ...clientOrder, hasBudgetAmount: false }, "delivery").amount).toBeNull();
    const free = buildRepairDocumentData({ ...clientOrder, budgetAmount: 0, finalAmount: 0, hasWarranty: false }, "delivery");
    expect(free.amount).toBe(0);
    expect(free.client?.balance).toBe(0);
  });
});

describe("read-only payment snapshot", () => {
  it("counts native and legacy once, excluding mirrors and voided entries", () => {
    const snapshot = readDocumentPayments({ repairs: [{ final_price: 150000, estimated_price: 150000, repair_payments: [payment] }], repair_access_payments: [
      { ...payment, id: "mirror", legacy_repair_payment_id: "p1", voided_at: null },
      { ...payment, id: "void", legacy_repair_payment_id: null, voided_at: "2026-10-11" },
      { ...payment, id: "p2", amount: 100000, method: "NX_LOCAL", legacy_repair_payment_id: null, voided_at: null }
    ] });
    expect(snapshot.payments).toHaveLength(2);
    const data = buildRepairDocumentData(clientOrder, "delivery", null, snapshot);
    expect(data.client?.paidTotal).toBe(150000);
    expect(data.client?.balance).toBe(0);
  });
  it("rejects ambiguous links, missing relations and invalid amounts instead of fabricating a receipt", () => {
    expect(() => readDocumentPayments({ repairs: [{}, {}], repair_access_payments: [] })).toThrow();
    expect(() => readDocumentPayments({})).toThrow();
    expect(() => readDocumentPayments({ repairs: [{ repair_payments: [{ ...payment, amount: null }] }], repair_access_payments: [] })).toThrow();
  });
  it("keeps partial payments and a different final charge explicit", () => {
    const snapshot = readDocumentPayments({ repairs: [{ final_price: 140000, estimated_price: 150000, repair_payments: [payment] }], repair_access_payments: [] });
    const data = buildRepairDocumentData(clientOrder, "delivery", null, snapshot);
    expect(data.amount).toBe(150000);
    expect(data.client).toMatchObject({ finalTotal: 140000, paidTotal: 50000, balance: 90000 });
  });
  it("does not mistake a historical initialized zero for a waived positive budget", () => {
    const snapshot = readDocumentPayments({ repairs: [], repair_access_payments: [
      { ...payment, legacy_repair_payment_id: null, voided_at: null }
    ] });
    const data = buildRepairDocumentData({ ...clientOrder, finalAmount: 0, hasFinalAmount: true }, "delivery", null, snapshot);
    expect(data.client).toMatchObject({ finalTotal: 150000, paidTotal: 50000, balance: 100000, credit: 0 });
  });
  it("keeps an unknown charge unknown, while honoring a linked explicit zero", () => {
    const snapshot = readDocumentPayments({ repairs: [], repair_access_payments: [
      { ...payment, legacy_repair_payment_id: null, voided_at: null }
    ] });
    const data = buildRepairDocumentData({ ...clientOrder, hasBudgetAmount: false, finalAmount: 0 }, "delivery", null, snapshot);
    expect(data.client).toMatchObject({ finalTotal: null, paidTotal: 50000, balance: null, credit: 0 });
    const free = buildRepairDocumentData(clientOrder, "delivery", null, { payments: [], finalTotal: 0 });
    expect(free.client).toMatchObject({ finalTotal: 0, balance: 0, credit: 0 });
  });
});
