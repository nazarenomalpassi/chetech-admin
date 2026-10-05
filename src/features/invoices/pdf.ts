import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatCashMethod } from "@/lib/cash";
import { formatInvoiceSource } from "./labels";

export type InvoicePdfData = {
  invoiceNumber: string; createdAt: string; customerName: string; customerPhone: string;
  sourceType: string; status: string; notes: string;
  subtotal: number; discount: number; total: number; paidTotal: number; balance: number;
  fiscalProvider: string | null; fiscalReference: string | null; fiscalIssuedAt: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  payments: Array<{ method: string; amount: number; paymentDate: string }>;
};

const ink = "#1d1d1b";
const muted = "#555552";
const accent = "#888989";
const paper = "#f1f1ee";
const rule = "#ddddda";

export function renderInvoicePdf(doc: PDFKit.PDFDocument, invoice: InvoicePdfData) {
  doc.registerFont("Body", readFileSync(path.join(process.cwd(), "public/brand/InputSans.otf")));
  doc.registerFont("Brand", readFileSync(path.join(process.cwd(), "public/brand/MONTECHV02-Bold.otf")));
  const left = 42;
  const width = doc.page.width - left * 2;
  const bottom = doc.page.height - 70;
  let y = 112;
  let pages = 0;
  let maxContentY = 0;
  let tableActive = false;
  let renderedDescriptionCharacters = 0;
  const textOptions = { width, lineGap: 3 };

  function header() {
    pages++;
    doc.rect(left, 36, 5, 43).fill(accent);
    doc.font("Brand").fontSize(23).fillColor(ink).text("CHETECH", left + 15, 39, { width: 235, lineBreak: false });
    doc.font("Body").fontSize(8).fillColor(muted).text("Servicio tecnico y tecnologia", left + 15, 69, { width: 260, lineBreak: false });
    doc.fontSize(11).fillColor(ink).text(invoice.invoiceNumber, 310, 43, { width: width - 268, align: "right" });
    doc.fontSize(8).fillColor(muted).text(`${formatDate(invoice.createdAt)} | ${invoice.status.toUpperCase()}`, 310, 65, { width: width - 268, align: "right" });
    doc.moveTo(left, 93).lineTo(left + width, 93).strokeColor(rule).stroke();
    y = 112;
  }

  function columns() {
    doc.rect(left, y, width, 26).fill(paper);
    doc.font("Body").fontSize(8).fillColor(muted);
    doc.text("Descripcion", left + 8, y + 8, { width: 254 });
    doc.text("Cant.", left + 270, y + 8, { width: 38, align: "right" });
    doc.text("Precio", left + 316, y + 8, { width: 88, align: "right" });
    doc.text("Importe", left + 412, y + 8, { width: width - 420, align: "right" });
    y += 35;
  }

  function nextPage() {
    doc.addPage(); header();
    if (tableActive) columns();
  }

  function ensure(height: number) {
    if (y + height > bottom) nextPage();
  }

  function measure(text: string, textWidth: number, size = 10) {
    return doc.font("Body").fontSize(size).heightOfString(text, { width: textWidth, lineGap: 3 });
  }

  // Split even a single oversized row or unbroken identifier without losing content.
  function fittingPrefix(text: string, textWidth: number, available: number, size = 10) {
    if (measure(text, textWidth, size) <= available) return text;
    let low = 1; let high = text.length; let end = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measure(text.slice(0, mid), textWidth, size) <= available) { end = mid; low = mid + 1; } else high = mid - 1;
    }
    if (!end) return "";
    const boundary = Math.max(text.lastIndexOf(" ", end - 1), text.lastIndexOf("\n", end - 1));
    if (boundary > end / 2) end = boundary + 1;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    return text.slice(0, end);
  }

  function paragraph(text: string, size = 10, color = ink) {
    let remaining = text;
    while (remaining.length) {
      ensure(30);
      const chunk = fittingPrefix(remaining, width, bottom - y - 8, size);
      if (!chunk) { nextPage(); continue; }
      const height = measure(chunk, width, size);
      doc.font("Body").fontSize(size).fillColor(color).text(chunk, left, y, textOptions);
      y += height + 8;
      maxContentY = Math.max(maxContentY, y);
      remaining = remaining.slice(chunk.length);
      if (remaining) nextPage();
    }
  }

  header();
  paragraph(invoice.status === "anulado" ? "COMPROBANTE INTERNO ANULADO" : "COMPROBANTE INTERNO", 16);
  paragraph("No valido como factura fiscal. Emitir o reimprimir no registra un nuevo cobro.", 8, muted);
  paragraph(`Cliente: ${invoice.customerName}`, 11);
  paragraph(`Telefono: ${invoice.customerPhone || "Sin telefono"} | Origen: ${formatInvoiceSource(invoice.sourceType)}`, 9, muted);
  if (invoice.fiscalReference) {
    paragraph(`Referencia fiscal externa: ${invoice.fiscalProvider || "Proveedor externo"} / ${invoice.fiscalReference}`, 9);
    if (invoice.fiscalIssuedAt) paragraph(`Fecha de emision externa: ${formatDate(invoice.fiscalIssuedAt)}`, 8, muted);
    paragraph("Esta referencia fue vinculada; este documento interno no autoriza ni sustituye al comprobante fiscal.", 8, muted);
  }
  if (invoice.notes) paragraph(`Observaciones: ${invoice.notes}`, 9, muted);
  ensure(65); tableActive = true; columns();

  for (const item of invoice.items) {
    let remaining = item.description;
    let firstSegment = true;
    const descriptionWidth = 254;
    while (remaining.length) {
      ensure(34);
      const chunk = fittingPrefix(remaining, descriptionWidth, bottom - y - 16, 9);
      if (!chunk) { nextPage(); continue; }
      const rowHeight = Math.max(measure(chunk, descriptionWidth, 9), firstSegment ? Math.max(measure(formatCurrency(item.unitPrice), 88, 9), measure(formatCurrency(item.total), width - 420, 9)) : 14) + 16;
      ensure(rowHeight);
      doc.font("Body").fontSize(9).fillColor(ink).text(chunk, left + 8, y, { width: descriptionWidth, lineGap: 3 });
      if (firstSegment) {
        doc.text(String(item.quantity), left + 270, y, { width: 38, align: "right", lineGap: 3 });
        doc.text(formatCurrency(item.unitPrice), left + 316, y, { width: 88, align: "right", lineGap: 3 });
        doc.text(formatCurrency(item.total), left + 412, y, { width: width - 420, align: "right", lineGap: 3 });
      }
      renderedDescriptionCharacters += chunk.length;
      remaining = remaining.slice(chunk.length); firstSegment = false;
      y += rowHeight;
      maxContentY = Math.max(maxContentY, y);
      doc.moveTo(left, y - 7).lineTo(left + width, y - 7).strokeColor(rule).stroke();
      if (remaining) nextPage();
    }
  }
  tableActive = false; y += 10;
  const totals = [["Subtotal", invoice.subtotal], ["Descuento", invoice.discount], ["Total", invoice.total], ["Pagado real", invoice.paidTotal], ["Saldo pendiente", invoice.balance]] as const;
  ensure(180);
  doc.rect(left, y, width, 165).fill(paper);
  for (const [index, [label, amount]] of totals.entries()) {
    const rowY = y + 15 + index * 28;
    doc.font("Body").fontSize(index === 4 ? 12 : 10).fillColor(ink);
    doc.text(label, left + 16, rowY, { width: 260 });
    doc.text(formatCurrency(amount), left + 290, rowY, { width: width - 306, align: "right" });
  }
  y += 180; maxContentY = Math.max(maxContentY, y);
  if (invoice.payments.length) {
    paragraph("Cobros efectivos vinculados", 10);
    for (const payment of invoice.payments) paragraph(`${formatDate(payment.paymentDate)} | ${formatCashMethod(payment.method)} | ${formatCurrency(payment.amount)}`, 9, muted);
  } else paragraph("Sin cobros efectivos vinculados.", 9, muted);
  if (invoice.paidTotal > invoice.total) paragraph(`Excedente de cobros vinculados: ${formatCurrency(invoice.paidTotal - invoice.total)}. Revisar imputacion.`, 9, muted);
  if (invoice.status === "anulado") paragraph("La anulacion del documento no revierte cobros de la operacion.", 9, muted);

  const range = doc.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    doc.switchToPage(range.start + page);
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Body").fontSize(7).fillColor(muted).text(`CHETECH | Comprobante interno | Pagina ${page + 1} de ${range.count}`, left, doc.page.height - 45, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = previousBottom;
  }
  return { pages, pageHeaders: pages, maxContentY, renderedItems: invoice.items.length, renderedDescriptionCharacters, totals: { total: invoice.total, paidTotal: invoice.paidTotal, balance: invoice.balance } };
}

export async function generateInvoicePdf(invoice: InvoicePdfData) {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: `CHETECH - ${invoice.invoiceNumber}`, Author: "CHETECH" } });
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    try { renderInvoicePdf(doc, invoice); doc.end(); } catch (error) { doc.destroy(); reject(error); }
  });
}
