import { mkdirSync, writeFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { buildRepairDocumentData } from "../src/features/repairs-access/documents";
import { generateRepairDocumentPdf, renderRepairDocumentPdf } from "../src/features/repairs-access/repair-document-pdf";

// Synthetic fixtures only. This script has no database connection or environment credentials.
const order = {
  id: "00000000-0000-4000-8000-000000000357", repairNumber: "REP-000357", intakeDate: "2026-10-10", issueReported: "El televisor enciende, tiene sonido pero no muestra imagen.",
  budgetAmount: 150000, hasBudgetAmount: true, budgetDetail: "Cambio del juego completo de tiras LED.\nIncluye colocación, revisión de fuente y pruebas de imagen y sonido.",
  finalAmount: 150000, hasFinalAmount: true, pickedUpAt: "2026-10-20T00:00:00-03:00", deliveredAt: "2026-10-20T20:45:00Z", status: "retirado",
  workPerformed: "NOTA INTERNA NO PUBLICAR", hasWarranty: true, warrantyRequiresReview: false, warrantyDays: 90,
  warrantyStart: "2026-10-20", warrantyUntil: "2027-01-18", warrantyConditions: "Cubre el kit de retroiluminación instalado y el trabajo realizado.",
  customer: { fullName: "María Fernández (ejemplo)", phone: "3571000000", address: "Calle de ejemplo 123, Río Tercero" },
  device: { deviceType: "Televisor LED 43 pulgadas", brand: "Samsung", model: "UN43J5200", color: "Negro", serialNumber: "EJEMPLO-004321", accessoryDetails: "Control remoto original y cable de alimentación.", visualCondition: "Marcas leves en el gabinete. Pantalla sin golpes visibles." }
};
const snapshot = { finalTotal: 150000, payments: [
  { id: "p1", date: "2026-10-10", method: "efectivo", amount: 50000 },
  { id: "p2", date: "2026-10-20", method: "mp", amount: 100000 }
] };

async function main() {
  mkdirSync("tmp/pdfs", { recursive: true });
  for (const kind of ["intake", "delivery"] as const) {
    for (const long of [false, true]) {
      const source = long ? { ...order, issueReported: order.issueReported.repeat(90), budgetDetail: order.budgetDetail.repeat(50), warrantyConditions: order.warrantyConditions.repeat(45), device: { ...order.device, accessoryDetails: order.device.accessoryDetails.repeat(90) } } : order;
      const payments = long ? { ...snapshot, payments: Array.from({ length: 35 }, (_, i) => ({ ...snapshot.payments[0], id: `p${i}`, amount: 1000 })) } : snapshot;
      const data = buildRepairDocumentData(source, kind, null, payments);
      const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
      const layout = renderRepairDocumentPdf(doc, data); doc.end();
      const name = `${kind}${long ? "-long" : ""}`;
      writeFileSync(`tmp/pdfs/${name}.pdf`, await generateRepairDocumentPdf(data));
      writeFileSync(`tmp/pdfs/${name}-layout.json`, JSON.stringify(layout, null, 2));
      console.log(name, "pages", layout.pages, layout.sectionSegments.map((s) => `${s.label || "text"}:${s.page}/${s.endY.toFixed(1)}`).join(", "));
    }
  }
}
void main();
