import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RepairDocumentData } from "./documents";

const colors = { ink: "#222222", muted: "#666666", accent: "#888888", paper: "#eeeeee", rule: "#dddddd" };
type PdfOptions = { orderUrl?: string };
type Segment = { label: string; page: number; startY: number; endY: number; characters: number };

export function renderRepairDocumentPdf(doc: PDFKit.PDFDocument, data: RepairDocumentData, qr?: Buffer) {
  doc.registerFont("Body", readFileSync(path.join(process.cwd(), "public/brand/InputSans.otf")));
  doc.registerFont("Brand", readFileSync(path.join(process.cwd(), "public/brand/MONTECHV02-Bold.otf")));
  const left = 42;
  const width = doc.page.width - left * 2;
  const bodyTop = 183;
  const bodyBottom = doc.page.height - 76;
  const footerY = doc.page.height - 43;
  let y = bodyTop;
  let pages = 0;
  let renderedSectionCharacters = 0;
  const sectionSegments: Segment[] = [];
  const documentDate = data.date.includes("T") ? new Date(data.date) : data.date;

  function header() {
    pages++;
    doc.rect(left, 36, 5, 43).fill(colors.accent);
    doc.font("Brand").fontSize(25).fillColor(colors.ink).text("CHETECH", left + 15, 38, { width: 300, lineBreak: false });
    doc.font("Body").fontSize(9).fillColor(colors.muted).text("Servicio tecnico y tecnologia", left + 15, 69, { width: 300, lineBreak: false });
    if (qr) {
      doc.image(qr, left + width - 66, 35, { width: 66 });
      doc.fontSize(7).text("Consultar orden", left + width - 90, 104, { width: 114, align: "center", lineBreak: false });
    }
    doc.font("Body").fontSize(17).fillColor(colors.ink).text(`${data.number} / ${data.title}`, left, 115, { width, lineBreak: false });
    doc.fontSize(9).fillColor(colors.muted).text(`${data.dateLabel}: ${formatDate(documentDate)}${data.budgetRevision !== null ? ` / Revision ${data.budgetRevision}` : ""}`, left, 142, { width, lineBreak: false });
    if (data.kind !== "intake") doc.fontSize(8).text(`Ingreso del equipo: ${formatDate(data.intakeDate)}`, left, 158, { width, lineBreak: false });
    doc.moveTo(left, 173).lineTo(left + width, 173).strokeColor(colors.rule).stroke();
    y = bodyTop;
  }

  function nextPage() { doc.addPage(); header(); }
  function ensure(height: number) { if (y + height > bodyBottom) nextPage(); }
  function measure(text: string, size: number, textWidth = width) {
    return doc.font("Body").fontSize(size).heightOfString(text, { width: textWidth, lineGap: 3 });
  }

  // Explicit page chunks keep even a single oversized section below the footer.
  function fittingPrefix(text: string, available: number, size: number) {
    if (measure(text, size) <= available) return text;
    let low = 1; let high = text.length; let end = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (measure(text.slice(0, middle), size) <= available) { end = middle; low = middle + 1; } else high = middle - 1;
    }
    const boundary = Math.max(text.lastIndexOf(" ", end - 1), text.lastIndexOf("\n", end - 1));
    if (boundary > end / 2) end = boundary + 1;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    return text.slice(0, end);
  }

  header();
  for (const section of data.sections) {
    let remaining = section.value || "No informado";
    let continuation = false;
    while (remaining.length) {
      const label = `${section.label}${continuation ? " (continuacion)" : ""}`;
      const labelHeight = measure(label, 9);
      ensure(labelHeight + 38);
      const startY = y;
      const chunk = fittingPrefix(remaining, bodyBottom - y - labelHeight - 19, 11);
      if (!chunk) { nextPage(); continue; }
      doc.font("Body").fontSize(9).fillColor(colors.muted).text(label, left, y, { width, lineGap: 3 });
      y += labelHeight + 5;
      const height = measure(chunk, 11);
      doc.font("Body").fontSize(11).fillColor(colors.ink).text(chunk, left, y, { width, lineGap: 3 });
      y += height + 14;
      sectionSegments.push({ label: section.label, page: pages, startY, endY: y, characters: chunk.length });
      renderedSectionCharacters += chunk.length;
      remaining = remaining.slice(chunk.length);
      continuation = true;
      if (remaining) nextPage();
    }
  }

  if (data.amount !== null) {
    ensure(76);
    doc.rect(left, y, width, 62).fill(colors.paper);
    doc.font("Body").fontSize(9).fillColor(colors.muted).text("Importe de esta revision de presupuesto", left + 14, y + 10, { width: width - 28 });
    doc.font("Body").fontSize(22).fillColor(colors.ink).text(formatCurrency(data.amount), left + 14, y + 28, { width: width - 28, lineBreak: false });
    y += 76;
  }

  let notice = data.notice;
  while (notice.length) {
    ensure(30);
    const chunk = fittingPrefix(notice, bodyBottom - y - 16, 9);
    if (!chunk) { nextPage(); continue; }
    const height = measure(chunk, 9);
    doc.font("Body").fontSize(9).fillColor(colors.muted).text(chunk, left, y, { width, lineGap: 3 });
    y += height + 16;
    notice = notice.slice(chunk.length);
    if (notice) nextPage();
  }

  const signatureHeight = 106;
  ensure(signatureHeight);
  const signature = { page: pages, startY: y, endY: y + signatureHeight };
  const signatureWidth = (width - 34) / 2;
  doc.moveTo(left, y + 40).lineTo(left + signatureWidth, y + 40).strokeColor(colors.accent).stroke();
  doc.moveTo(left + signatureWidth + 34, y + 40).lineTo(left + width, y + 40).stroke();
  doc.font("Body").fontSize(8).fillColor(colors.muted).text(data.signatureLabel, left, y + 47, { width: signatureWidth, lineGap: 3 });
  doc.text("CHETECH / responsable", left + signatureWidth + 34, y + 47, { width: signatureWidth, lineGap: 3 });
  doc.fontSize(8).text("Aclaracion: __________________________", left, y + 79, { width: signatureWidth });
  doc.text("Aclaracion: __________________________", left + signatureWidth + 34, y + 79, { width: signatureWidth });

  const range = doc.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    doc.switchToPage(range.start + page);
    // Footer writing must not trigger PDFKit's automatic extra page at bottom margin.
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Body").fontSize(7).fillColor(colors.muted).text(`CHETECH / ${data.number} / Documento de taller, no fiscal / ${page + 1} de ${range.count}`, left, footerY, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = previousBottom;
  }
  return { pages, pageHeaders: pages, bodyTop, bodyBottom, footerY, renderedSectionCharacters, sectionSegments, signature };
}

export async function generateRepairDocumentPdf(data: RepairDocumentData, options: PdfOptions = {}) {
  const qr = options.orderUrl ? await QRCode.toBuffer(options.orderUrl, { width: 180, margin: 1, color: { dark: "#222222", light: "#ffffff" } }) : undefined;
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: `CHETECH - ${data.number} - ${data.title}`, Author: "CHETECH" } });
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try { renderRepairDocumentPdf(doc, data, qr); doc.end(); } catch (error) { doc.destroy(); reject(error); }
  });
}
