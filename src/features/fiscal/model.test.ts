import { describe, expect, it } from "vitest";
import { buildFiscalSnapshot, businessDate, decimalCents, validateCuit } from "./model";
import { readFiscalConfig } from "./config";

import { invoiceFixture as invoice, inputFixture as input, snapshotFixture as snapshot, issuerFixture } from "./fixtures";

describe("fiscal snapshots", () => {
  it("validates the supplied issuer CUIT and rejects a wrong check digit", () => {
    expect(validateCuit("20-12345678-6")).toBe("20123456786");
    expect(() => validateCuit("20123456787")).toThrow();
    expect(() => validateCuit("00000000000")).toThrow();
  });
  it("uses decimal half-even rounding without floating point drift", () => {
    expect(decimalCents("1.005")).toBe(100);
    expect(decimalCents("1.015")).toBe(102);
    expect(decimalCents("999.995")).toBe(100000);
    expect(() => decimalCents(Infinity)).toThrow();
    expect(() => decimalCents("-1")).toThrow();
  });
  it("uses Argentina's date rather than UTC near midnight", () => {
    expect(businessDate(new Date("2026-10-06T01:30:00Z"))).toBe("2026-10-05");
  });
  it("captures immutable document amounts and explicit service and IVA data", () => {
    const result = snapshot();
    expect(result.totalCents).toBe(10000);
    expect(result.voucherType).toBe(11);
    expect(result.concept).toBe(2);
    expect(result.receiver.ivaCondition).toBe(5);
    invoice.items[0].description = "Modificado";
    expect(result.items[0].description).toBe("Servicio");
    invoice.items[0].description = "Servicio";
    expect(result).not.toHaveProperty("paidTotal");
  });
  it.each(["pagado", "parcial", "pendiente"])("allows %s invoices without changing cash", (status) => {
    expect(buildFiscalSnapshot({ ...invoice, status }, input, snapshot()).totalCents).toBe(10000);
  });
  it.each(["pagado", "parcial", "pendiente"])("supports a native repair_access service that is %s", (status) => {
    const repairAccessOrderId = "00000000-0000-4000-8000-000000000022";
    const result = buildFiscalSnapshot({ ...invoice, sourceType: "repair_access", repairId: null, repairAccessOrderId, status }, input, snapshot());
    expect(result).toMatchObject({ sourceType: "repair_access", repairId: null, repairAccessOrderId, concept: 2, voucherType: 11, totalCents: 10000 });
    expect(result).not.toHaveProperty("paidTotal");
  });
  it("requires a native REP link and an explicit service concept without rewriting the snapshot", () => {
    const doc = { ...invoice, sourceType: "repair_access", repairId: null, repairAccessOrderId: "00000000-0000-4000-8000-000000000022" };
    expect(() => buildFiscalSnapshot({ ...doc, repairAccessOrderId: null }, input, snapshot())).toThrow();
    expect(() => buildFiscalSnapshot(doc, { ...input, concept: 3 }, snapshot())).toThrow();
    expect(() => buildFiscalSnapshot(doc, { concept: 1, issuedOn: input.issuedOn, receiver: input.receiver }, snapshot())).toThrow();
  });
  it("compares the receptor to the configured issuer rather than a public taxpayer constant", () => {
    const config = { ...snapshot(), issuer: { ...issuerFixture, cuit: "20123456786" } };
    expect(() => buildFiscalSnapshot(invoice, { ...input, receiver: { ...input.receiver, documentType: 80, documentNumber: config.issuer.cuit } }, config)).toThrow(/receptor/i);
  });
  it("allows explicit homologation PV1 but blocks production PV1", () => {
    expect(buildFiscalSnapshot(invoice, input, { ...snapshot(), pointOfSale: 1 }).pointOfSale).toBe(1);
    expect(() => buildFiscalSnapshot(invoice, input, { ...snapshot(), environment: "production", pointOfSale: 1 })).toThrow();
  });
  it("rejects annulled, manual/unlinked, mismatched totals, missing IVA and bad service periods", () => {
    for (const doc of [{ ...invoice, status: "anulado" }, { ...invoice, sourceType: "manual" }, { ...invoice, total: 99 }, { ...invoice, repairId: null }]) {
      expect(() => buildFiscalSnapshot(doc, input, snapshot())).toThrow();
    }
    expect(() => buildFiscalSnapshot(invoice, { ...input, receiver: { ...input.receiver, ivaCondition: undefined } }, snapshot())).toThrow();
    expect(() => buildFiscalSnapshot(invoice, { ...input, serviceTo: "2026-09-01" }, snapshot())).toThrow();
    expect(() => buildFiscalSnapshot(invoice, { ...input, issuedOn: "2026-02-30" }, snapshot())).toThrow();
  });
});

describe("safe configuration", () => {
  it("requires a valid encryption key only when the remaining fiscal setup is configured", () => {
    const env = { ARCA_ISSUER_CUIT: "20123456786", ARCA_HOMO_POINT_OF_SALE: "2", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "true",
      ARCA_HOMO_CERTIFICATE_PEM: "synthetic certificate", ARCA_HOMO_PRIVATE_KEY_PEM: "synthetic key",
      ARCA_ISSUER_NAME: "Emisor", ARCA_ISSUER_ADDRESS: "Domicilio", ARCA_ISSUER_GROSS_INCOME: "Exento",
      ARCA_ISSUER_ACTIVITY_START: "2020-01-01", SUPABASE_SERVICE_ROLE_KEY: "synthetic service key" };
    expect(readFiscalConfig({}).issues.join(" ")).not.toContain("ARCA_TICKET_ENCRYPTION_KEY");
    expect(readFiscalConfig(env).issues.join(" ")).toContain("ARCA_TICKET_ENCRYPTION_KEY");
    expect(readFiscalConfig({ ...env, ARCA_TICKET_ENCRYPTION_KEY: "base64:invalid" }).issues.join(" ")).toContain("ARCA_TICKET_ENCRYPTION_KEY");
    expect(readFiscalConfig({ ...env, ARCA_TICKET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }).issues).toEqual([]);
  });
  it("requires a valid server-configured issuer CUIT with no default personal identity", () => {
    expect(readFiscalConfig({}).issuer.cuit).toBe("");
    expect(readFiscalConfig({}).issues.join(" ")).toContain("ARCA_ISSUER_CUIT");
    expect(readFiscalConfig({ ARCA_ISSUER_CUIT: "20-12345678-6" }).issuer.cuit).toBe("20123456786");
    expect(readFiscalConfig({ ARCA_ISSUER_CUIT: "20123456787" }).issues.join(" ")).toContain("ARCA_ISSUER_CUIT");
  });
  it("accepts homologation PV1 only with explicit configuration and the WS verification flag", () => {
    const env = { ARCA_TICKET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), ARCA_ISSUER_CUIT: "20123456786", ARCA_HOMO_POINT_OF_SALE: "1", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "true",
      ARCA_HOMO_CERTIFICATE_PEM: "synthetic certificate", ARCA_HOMO_PRIVATE_KEY_PEM: "synthetic key",
      ARCA_ISSUER_NAME: "Emisor sintetico", ARCA_ISSUER_ADDRESS: "Domicilio sintetico", ARCA_ISSUER_GROSS_INCOME: "Exento",
      ARCA_ISSUER_ACTIVITY_START: "2020-01-01", SUPABASE_SERVICE_ROLE_KEY: "synthetic service key" };
    expect(readFiscalConfig(env).issues).toEqual([]);
    expect(readFiscalConfig({ ...env, ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: undefined }).issues.join(" ")).toMatch(/confirmar/i);
  });
  it("defaults to homologation and does not assume PV 1 or credentials", () => {
    const config = readFiscalConfig({});
    expect(config.environment).toBe("homologation");
    expect(config.pointOfSale).toBeNull();
    expect(config.issues.length).toBeGreaterThan(0);
    expect(config).not.toHaveProperty("password");
  });
  it("requires an explicit production switch and rejects PV 1", () => {
    const config = readFiscalConfig({ ARCA_ENVIRONMENT: "production", ARCA_PROD_POINT_OF_SALE: "1" });
    expect(config.issues.join(" ")).toMatch(/produccion/i);
    expect(config.issues.join(" ")).toMatch(/00001/);
  });
  it("never silently converts a misspelled environment into production or testing", () => {
    expect(readFiscalConfig({ ARCA_ENVIRONMENT: "prod" }).issues.join(" ")).toMatch(/entorno/i);
  });
  it("accepts private server PEM configuration without filesystem paths for Vercel", () => {
    const config = readFiscalConfig({ ARCA_TICKET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), ARCA_ISSUER_CUIT: "20123456786", ARCA_HOMO_POINT_OF_SALE: "2", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "true",
      ARCA_HOMO_CERTIFICATE_PEM: "synthetic certificate", ARCA_HOMO_PRIVATE_KEY_PEM: "synthetic key",
      ARCA_ISSUER_NAME: "Emisor", ARCA_ISSUER_ADDRESS: "Domicilio", ARCA_ISSUER_GROSS_INCOME: "Exento",
      ARCA_ISSUER_ACTIVITY_START: "2020-01-01", SUPABASE_SERVICE_ROLE_KEY: "synthetic service key" });
    expect(config.issues).toEqual([]);
    expect(config.certificatePath).toBeUndefined();
  });
  it("identifies each missing nonsecret issuer field precisely", () => {
    const issues = readFiscalConfig({}).issues.join(" ");
    for (const key of ["ARCA_ISSUER_CUIT", "ARCA_ISSUER_NAME", "ARCA_ISSUER_ADDRESS", "ARCA_ISSUER_GROSS_INCOME", "ARCA_ISSUER_ACTIVITY_START"]) expect(issues).toContain(key);
  });
  it("does not reuse homologation PEM or PV when production was selected", () => {
    const config = readFiscalConfig({ ARCA_ENVIRONMENT: "production", ARCA_PRODUCTION_ENABLED: "true",
      ARCA_HOMO_POINT_OF_SALE: "2", ARCA_HOMO_CERTIFICATE_PEM: "synthetic-cert", ARCA_HOMO_PRIVATE_KEY_PEM: "synthetic-key" });
    expect(config.pointOfSale).toBeNull();
    expect(config.certificatePem).toBeUndefined();
    expect(config.privateKeyPem).toBeUndefined();
  });
});
