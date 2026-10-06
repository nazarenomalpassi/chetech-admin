import { describe, expect, it } from "vitest";
import { buildFiscalQrUrl, generateFiscalPdf } from "./pdf";
import { snapshotFixture } from "./fixtures";
import type { FiscalRecord } from "./model";

const record = (): FiscalRecord => ({ id: "00000000-0000-4000-8000-000000000030", invoiceId: snapshotFixture().invoiceId,
  snapshot: snapshotFixture(), snapshotHash: "a".repeat(64), status: "accepted", number: 1,
  authorization: { cae: "12345678901234", expiresOn: "2026-10-15", number: 1, observationCodes: [] }, errorCodes: [] });
describe("authorized fiscal artifacts", () => {
  it("includes official QR metadata and the actual CAE", () => {
    const qr = new URL(buildFiscalQrUrl(record()));
    expect(qr.origin).toBe("https://www.arca.gob.ar");
    const payload = JSON.parse(Buffer.from(qr.searchParams.get("p")!, "base64").toString("utf8"));
    expect(payload).toMatchObject({ ver: 1, cuit: 20123456786, ptoVta: 2, tipoCmp: 11, nroCmp: 1,
      importe: 100, moneda: "PES", ctz: 1, tipoCodAut: "E", codAut: 12345678901234, fecha: "2026-10-05" });
  });
  it("never produces a QR or fiscal PDF without accepted CAE evidence", async () => {
    for (const invalid of [{ ...record(), status: "uncertain" as const }, { ...record(), authorization: null }, { ...record(), number: 2 }]) {
      expect(() => buildFiscalQrUrl(invalid)).toThrow();
      await expect(generateFiscalPdf(invalid)).rejects.toThrow();
    }
  });
  it("generates a real multipage PDF for long immutable snapshots", async () => {
    const long = record();
    long.snapshot.items = Array.from({ length: 40 }, (_, i) => ({ description: `${i} Servicio `.repeat(120), quantity: 1, unitPriceCents: 250, totalCents: 250 }));
    const pdf = await generateFiscalPdf(long);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10000);
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
