import PDFDocument from "pdfkit";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateInvoicePdf, renderInvoicePdf } from "./pdf";

describe("professional invoice PDF", () => {
  it("generates a complete PDF stream with brand fonts and synthetic data", async () => {
    const pdf = await generateInvoicePdf({ invoiceNumber: "FAC-0042", createdAt: "2026-10-05T12:00:00Z", customerName: "Cliente de prueba - Taller profesional", customerPhone: "Sin datos reales", sourceType: "repair", status: "parcial", notes: "El equipo permanece en el taller. Entrega fisica pendiente.", subtotal: 150000, discount: 0, total: 150000, paidTotal: 50000, balance: 100000, fiscalProvider: "Sistema externo", fiscalReference: "TEST-0001", fiscalIssuedAt: "2026-10-05T00:00:00-03:00", items: Array.from({ length: 18 }, (_, index) => ({ description: index === 0 ? "Diagnostico de fuente, verificacion de tensiones, reemplazo de componentes y control de calidad. ".repeat(5) : `Servicio ${index}: trabajo de taller y repuesto documentado.`, quantity: 1, unitPrice: 8333.33, total: 8333.33 })), payments: [{ method: "nx", amount: 30000, paymentDate: "2026-10-01" }, { method: "mp", amount: 20000, paymentDate: "2026-10-05" }] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    if (process.env.CHETECH_PDF_QA === "1") writeFileSync("src/features/invoices/financial-pdf-qa.pdf", pdf);
  });
  it("wraps long rows and repeats page headers while retaining paid/balance", () => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const invoice = {
      invoiceNumber: "FAC-10000", createdAt: "2026-10-05T12:00:00Z", customerName: "Cliente " .repeat(30), customerPhone: "123",
      sourceType: "repair", status: "parcial", notes: "Nota extensa. ".repeat(100), subtotal: 100, discount: 0, total: 100, paidTotal: 30, balance: 70,
      fiscalProvider: null, fiscalReference: null, fiscalIssuedAt: null,
      items: Array.from({ length: 30 }, (_, index) => ({ description: `Renglon ${index} - ${"Descripcion de servicio y repuestos. ".repeat(50)}`, quantity: 1, unitPrice: 10, total: 10 })),
      payments: [{ method: "nx", amount: 30, paymentDate: "2026-10-05" }]
    };
    const result = renderInvoicePdf(doc, invoice);
    expect(doc.bufferedPageRange().count).toBe(result.pages);
    expect(result.pages).toBeGreaterThan(3);
    expect(result.pageHeaders).toBe(result.pages);
    expect(result.maxContentY).toBeLessThanOrEqual(doc.page.height - 70);
    expect(result.totals).toEqual({ total: 100, paidTotal: 30, balance: 70 });
    expect(result.renderedItems).toBe(30);
    expect(result.renderedDescriptionCharacters).toBe(invoice.items.reduce((sum, item) => sum + item.description.length, 0));
    doc.end();
  });
});
