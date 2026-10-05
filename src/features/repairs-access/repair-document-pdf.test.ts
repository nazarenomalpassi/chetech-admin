import { writeFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vitest";
import { formatDate } from "@/lib/utils";
import { buildRepairDocumentData } from "./documents";
import { generateRepairDocumentPdf, renderRepairDocumentPdf } from "./repair-document-pdf";

const order = {
  id: "00000000-0000-4000-8000-000000000357", repairNumber: "REP-000357", intakeDate: "2026-09-01", issueReported: "No enciende",
  budgetAmount: 80000, budgetDetail: "Cambio de fuente", deliveredAt: "2026-10-06T15:14:00Z", pickedUpAt: null,
  workPerformed: "Reemplazo y control de calidad", warrantyDays: 30, warrantyConditions: "Sobre el trabajo realizado",
  customer: { fullName: "Cliente de prueba", phone: "Sin datos reales" },
  device: { deviceType: "Televisor", brand: "Marca", model: "Modelo", serialNumber: "TEST-123", accessoryDetails: "Control", visualCondition: "Buen estado" },
  internalObservations: "NOTA PRIVADA"
};
const quote = { id: "00000000-0000-4000-8000-000000000358", orderId: order.id, revision: 3, amount: 80000, detail: "Cambio de fuente y control de calidad", createdAt: "2026-10-05T01:30:00Z" };

describe("CHETECH repair PDF", () => {
  it("formats a real midnight-UTC budget timestamp in Argentina without treating it as a date-only intake", () => {
    const createdAt = "2026-10-05T00:00:00Z";
    const data = buildRepairDocumentData(order, "estimate", { ...quote, createdAt });
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const text = vi.spyOn(doc, "text");
    renderRepairDocumentPdf(doc, data);
    expect(text.mock.calls.some(([value]) => value === `Fecha del presupuesto: ${formatDate(new Date(createdAt))} / Revision 3`)).toBe(true);
    expect(text.mock.calls.some(([value]) => value === `Ingreso del equipo: ${formatDate(order.intakeDate)}`)).toBe(true);
    doc.end();
  });

  it("creates single-page intake, estimate and delivery streams with both embedded brand fonts", async () => {
    for (const kind of ["intake", "estimate", "delivery"] as const) {
      const data = buildRepairDocumentData(order, kind, quote);
      const pdf = await generateRepairDocumentPdf(data, { orderUrl: `https://example.test/reparaciones-access?order=${order.id}` });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.toString("latin1")).toContain("%%EOF");
      expect(pdf.toString("latin1").match(/\/FontFile[23]\b/g)?.length).toBe(2);
      expect(pdf.toString("latin1")).toContain("InputSans-Regular");
      expect(pdf.toString("latin1")).toContain("MONTECHV02-Bold");
      const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
      const layout = renderRepairDocumentPdf(doc, data);
      expect(doc.bufferedPageRange().count).toBe(1);
      expect(layout.pages).toBe(1);
      expect(layout.signature.endY).toBeLessThanOrEqual(layout.bodyBottom);
      doc.end();
      if (process.env.CHETECH_REPAIR_PDF_QA === "1") writeFileSync(`src/features/repairs-access/repair-document-qa-${kind}.pdf`, pdf);
    }
  });

  it("wraps twenty equivalent long sections including an oversized field without losing text or overlapping signatures/footers", async () => {
    const data = buildRepairDocumentData(order, "estimate", quote);
    data.sections = Array.from({ length: 20 }, (_, index) => ({
      label: `Trabajo ${index + 1}`, value: index === 0 ? "Prueba de campo extremadamente largo. ".repeat(350) : `Bloque ${index + 1}: ${"Detalle de servicio y controles realizados. ".repeat(12)}`
    }));
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const layout = renderRepairDocumentPdf(doc, data);
    expect(layout.pages).toBeGreaterThan(3);
    expect(doc.bufferedPageRange().count).toBe(layout.pages);
    expect(layout.pageHeaders).toBe(layout.pages);
    expect(layout.renderedSectionCharacters).toBe(data.sections.reduce((count, section) => count + section.value.length, 0));
    expect(layout.sectionSegments.filter((segment) => segment.label === "Trabajo 1").length).toBeGreaterThan(1);
    for (const segment of layout.sectionSegments) {
      expect(segment.startY).toBeGreaterThanOrEqual(layout.bodyTop);
      expect(segment.endY).toBeLessThanOrEqual(layout.bodyBottom);
      if (segment.page === layout.signature.page) expect(segment.endY).toBeLessThan(layout.signature.startY);
    }
    expect(layout.signature.endY).toBeLessThanOrEqual(layout.bodyBottom);
    expect(layout.footerY).toBeGreaterThan(layout.bodyBottom);
    doc.end();
    const pdf = await generateRepairDocumentPdf(data);
    expect(pdf.toString("latin1")).toContain("%%EOF");
    if (process.env.CHETECH_REPAIR_PDF_QA === "1") writeFileSync("src/features/repairs-access/repair-document-qa-long.pdf", pdf);
  });
});
