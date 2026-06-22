import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";

import { formatInvoiceSource } from "@/features/invoices/labels";
import { getInvoiceById } from "@/features/invoices/queries";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Necesitas iniciar sesion para descargar el comprobante." }, { status: 401 });
  }

  let invoice: Awaited<ReturnType<typeof getInvoiceById>>;
  try {
    const { id } = await context.params;
    invoice = await getInvoiceById(id);
  } catch {
    return NextResponse.json({ error: "No se pudo generar el PDF del comprobante." }, { status: 500 });
  }

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 42 });

  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fontSize(9)
    .fillColor("#888989")
    .text("CHETECH", 42, 42, { characterSpacing: 2 })
    .fontSize(8)
    .text("Servicio tecnico y tecnologia", 42, 56);

  doc
    .roundedRect(390, 36, 160, 84, 16)
    .fillAndStroke("#f1f1ee", "#ddddda")
    .fillColor("#1d1d1b")
    .fontSize(8)
    .text("RECIBO INTERNO", 410, 50, { characterSpacing: 2 })
    .fontSize(20)
    .text(invoice.invoiceNumber, 410, 66)
    .fontSize(9)
    .fillColor("#555552")
    .text(formatDate(invoice.createdAt), 410, 94);

  doc
    .fillColor("#1d1d1b")
    .fontSize(24)
    .text("Comprobante interno", 42, 145)
    .fontSize(9)
    .fillColor("#555552")
    .text("No valido como factura fiscal.", 42, 176);

  doc.moveTo(42, 205).lineTo(550, 205).strokeColor("#ddddda").stroke();

  doc
    .fillColor("#888989")
    .fontSize(8)
    .text("Cliente", 42, 225)
    .text("Origen", 300, 225)
    .fillColor("#1d1d1b")
    .fontSize(12)
    .text(invoice.customerName, 42, 240)
    .text(formatInvoiceSource(invoice.sourceType), 300, 240)
    .fontSize(9)
    .fillColor("#555552")
    .text(invoice.customerPhone || "Sin telefono", 42, 258)
    .text(invoice.notes || "Sin observaciones", 300, 258);

  let y = 310;
  doc.roundedRect(42, y - 14, 508, 28, 8).fill("#f4f4f1");
  doc
    .fillColor("#555552")
    .fontSize(8)
    .text("Descripcion", 54, y - 5)
    .text("Cantidad", 310, y - 5)
    .text("Precio", 385, y - 5)
    .text("Total", 475, y - 5);

  y += 28;
  doc.fontSize(9);
  for (const item of invoice.items) {
    doc
      .fillColor("#1d1d1b")
      .text(item.description, 54, y, { width: 235 })
      .text(String(item.quantity), 310, y)
      .text(formatCurrency(item.unitPrice), 385, y, { width: 75 })
      .text(formatCurrency(item.total), 475, y, { width: 75 });
    y += 26;
  }

  y += 28;
  const totalsX = 350;
  doc.roundedRect(totalsX, y - 18, 200, 118, 16).fill("#f4f4f1");
  doc
    .fillColor("#1d1d1b")
    .fontSize(10)
    .text("Subtotal", totalsX + 16, y)
    .text(formatCurrency(invoice.subtotal), totalsX + 95, y, { width: 85, align: "right" })
    .text("Descuento", totalsX + 16, y + 28)
    .text(formatCurrency(invoice.discount), totalsX + 95, y + 28, { width: 85, align: "right" })
    .moveTo(totalsX + 16, y + 58)
    .lineTo(totalsX + 184, y + 58)
    .strokeColor("#ddddda")
    .stroke()
    .fontSize(13)
    .text("Total", totalsX + 16, y + 72)
    .text(formatCurrency(invoice.total), totalsX + 95, y + 72, { width: 85, align: "right" });

  doc
    .fontSize(8)
    .fillColor("#888989")
    .text("Comprobante generado por Chetech Admin.", 42, 780);

  doc.end();
  const pdf = await done;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`
    }
  });
}
