import { describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "./fixtures";
import { fiscalInputFromSnapshot } from "./model";
import { snapshotHash } from "./issuance";
import { confirmFiscalInvoice, loadFiscalReadiness } from "./service";

const mocks = vi.hoisted(() => ({ previous: null as any, loadCredentials: vi.fn() }));
vi.mock("./repository", async (original) => {
  const real = await original<typeof import("./repository")>();
  return { ...real, createFiscalServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.previous, error: null }) }) }) }) }) };
});
vi.mock("./config", () => ({ readFiscalConfig: () => ({ environment: "homologation", issuer: { cuit: "20123456786" }, pointOfSale: 2, issues: [], certificatePem: "SECRET_CERTIFICATE", privateKeyPem: "SECRET_PRIVATE_KEY", certificatePath: "SECRET_CERT_PATH", ticketEncryptionKey: "SECRET_TICKET_ENCRYPTION_KEY" }),
  ENDPOINTS: { homologation: { wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" } } }));
vi.mock("./wsaa", () => ({ loadFiscalCredentials: mocks.loadCredentials, getAccessTicket: vi.fn() }));

describe("confirm replay boundary", () => {
  it("replays an accepted snapshot after parsing only fiscal input fields, without reading credentials or ARCA", async () => {
    const s = snapshotFixture();
    const hash = snapshotHash(s);
    mocks.previous = { id: "00000000-0000-4000-8000-000000000030", invoice_id: s.invoiceId, snapshot: s,
      snapshot_hash: hash, status: "accepted", voucher_number: 1, cae_authorization: { cae: "12345678901234", number: 1, expiresOn: "2026-10-15", observationCodes: [] } };
    const payload = { confirm: true, requestId: mocks.previous.id, snapshotHash: hash, environment: s.environment, input: fiscalInputFromSnapshot(s) };
    expect((await confirmFiscalInvoice(s.invoiceId, payload, "admin")).status).toBe("accepted");
    expect(mocks.loadCredentials).not.toHaveBeenCalled();
    await expect(confirmFiscalInvoice(s.invoiceId, { ...payload, input: { ...payload.input, receiver: { ...payload.input.receiver, name: "Otra persona" } } }, "admin")).rejects.toMatchObject({ status: 409 });
  });
  it("does not treat a client request lacking explicit confirmation as an issuance", async () => {
    const s = snapshotFixture();
    await expect(confirmFiscalInvoice(s.invoiceId, { confirm: false, requestId: mocks.previous.id, snapshotHash: snapshotHash(s), environment: s.environment, input: fiscalInputFromSnapshot(s) }, "admin")).rejects.toThrow();
  });
  it("never exposes PEM, paths, private keys or credentials in readiness responses", async () => {
    mocks.loadCredentials.mockResolvedValue({ fingerprint: "private-fingerprint" });
    const result = await loadFiscalReadiness();
    expect(result.ready).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_|private-fingerprint/);
    expect(Object.keys(result).sort()).toEqual(["environment", "issues", "issuerCuit", "pointOfSale", "ready", "today"].sort());
  });
});
