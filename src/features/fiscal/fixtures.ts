import { buildFiscalSnapshot } from "./model";

export const invoiceFixture = {
  id: "00000000-0000-4000-8000-000000000010", invoiceNumber: "FAC-0010", documentVersion: 1,
  sourceType: "repair", repairId: "00000000-0000-4000-8000-000000000020", saleId: null, repairAccessOrderId: null,
  status: "pendiente", customerName: "Cliente", subtotal: 100.10, discount: 0.10, total: 100,
  items: [{ description: "Servicio", quantity: 1, unitPrice: 100.10, total: 100.10 }]
};
export const issuerFixture = { cuit: "20123456786", name: "Emisor", address: "Domicilio fiscal",
  grossIncome: "Exento", activityStart: "2020-01-01" };
export const inputFixture = { concept: 2 as const, issuedOn: "2026-10-05", serviceFrom: "2026-10-01",
  serviceTo: "2026-10-05", paymentDue: "2026-10-05", receiver: {
    name: "Cliente", address: "Domicilio", documentType: 96 as const, documentNumber: "12345678", ivaCondition: 5
  } };
export const snapshotFixture = () => buildFiscalSnapshot(invoiceFixture, inputFixture, { environment: "homologation", pointOfSale: 2, issuer: issuerFixture });
