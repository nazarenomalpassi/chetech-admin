import { readFileSync } from "node:fs";
import path from "node:path";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RepairDocumentData } from "./documents";

const C = { ink: "#080D0F", white: "#FFFFFF", pale: "#F3F6F5", slate: "#708687", dark: "#445D5F", line: "#D3DCDA", muted: "#566365" };
type Segment = { label: string; page: number; startY: number; endY: number; characters: number };
const displayDate = (value: string | null) => value ? formatDate(value.includes("T") ? new Date(value) : value) : "Sin fecha registrada";

/** Approved digital-only designs. Every variable field is measured and may continue on a new page. */
export function renderClientDocumentPdf(doc: PDFKit.PDFDocument, data: RepairDocumentData) {
  const d = data.client;
  if (!d) throw new Error("Faltan datos del documento de cliente.");
  const asset = (file: string) => readFileSync(path.join(process.cwd(), "public/brand", file));
  doc.registerFont("Body", asset("InputSans.otf"));
  doc.registerFont("Brand", asset("MONTECHV02-Bold.otf"));
  doc.registerFont("Medium", asset("InputSans-Medium.otf"));
  const logo = asset("document-logo-white.png");
  const symbol = asset("document-symbol.png");
  const left = 34, width = doc.page.width - 68, bodyTop = 267, bodyBottom = 761, footerY = 776;
  const issued = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(new Date());
  let y = bodyTop, pages = 0;
  const sectionSegments: Segment[] = [];

  function measure(value: string, size = 10.7, w = width, font = "Body", gap = 3) {
    return doc.font(font).fontSize(size).heightOfString(value, { width: w, lineGap: gap });
  }
  function text(value: string, x: number, top: number, w: number, size = 10.7, font = "Body", color = C.ink, align: "left" | "right" = "left", gap = 3) {
    doc.font(font).fontSize(size).fillColor(color).text(value, x, top, { width: w, lineGap: gap, align });
  }
  function line(top: number) { doc.save().moveTo(left, top).lineTo(left + width, top).lineWidth(0.7).strokeColor(C.line).stroke().restore(); }
  function panel(x: number, top: number, w: number, h: number, color: string) {
    doc.save().moveTo(x, top).lineTo(x + w - 12, top).lineTo(x + w, top + 12).lineTo(x + w, top + h)
      .lineTo(x + 12, top + h).lineTo(x, top + h - 12).closePath().fill(color).restore();
  }
  function header() {
    pages++;
    doc.rect(0, 0, doc.page.width, 20).fill(C.pale);
    text("DOCUMENTO DIGITAL / CHETECH", left, 5, width, 7.6, "Body", C.dark, "left", 0);
    doc.rect(0, 20, doc.page.width, 90).fill(C.ink);
    doc.save().rect(0, 20, doc.page.width, 90).clip().opacity(0.045).image(symbol, 360, 4, { width: 245 }).restore();
    doc.save().strokeColor("#2E4143").lineWidth(0.5).moveTo(320, 20).lineTo(320, 50).lineTo(295, 75).lineTo(295, 110).stroke().restore();
    doc.image(logo, left, 40, { width: 223 });
    text("Independencia 784", 335, 38, 226, 10, "Body", "#E5ECEA", "left", 0);
    text("Río Tercero, Córdoba", 335, 55, 226, 10, "Body", "#E5ECEA", "left", 0);
    text("WhatsApp 3571 544683", 335, 72, 226, 10, "Body", "#E5ECEA", "left", 0);
    text(data.title, left, 129, width, 22, "Brand");
    text(data.kind === "intake" ? "Comprobante de recepción para revisión técnica" : "Comprobante interno. No válido como factura fiscal.", left, 167, width, 10, "Body", C.muted);
    panel(left, 194, width, 59, C.pale);
    text("Orden de reparación", left + 15, 204, 255, 9.5, "Body", C.muted);
    let numberSize = 21;
    while (doc.font("Medium").fontSize(numberSize).widthOfString(data.number) > 275 && numberSize > 8) numberSize--;
    text(data.number, left + 15, 221, 275, numberSize, "Medium", C.ink, "left", 0);
    text(data.kind === "intake" ? "Fecha de ingreso" : "Fecha de retiro", left + 305, 204, 180, 9.5, "Body", C.muted);
    text(displayDate(data.date), left + 305, 221, 180, 12, "Medium", C.ink, "left", 0);
    y = bodyTop;
  }
  function nextPage() { doc.addPage(); header(); }
  function ensure(height: number) { if (y + height > bodyBottom) nextPage(); }
  function prefix(value: string, available: number, size: number, w: number, font: string, gap: number) {
    if (measure(value, size, w, font, gap) <= available) return value;
    let low = 1, high = value.length, end = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measure(value.slice(0, mid), size, w, font, gap) <= available) { end = mid; low = mid + 1; } else high = mid - 1;
    }
    const boundary = Math.max(value.lastIndexOf(" ", end - 1), value.lastIndexOf("\n", end - 1));
    if (boundary > end / 2) end = boundary + 1;
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
    return value.slice(0, end);
  }
  function block(label: string, value: string, options: { shade?: boolean; size?: number; headingSize?: number; gap?: number; padding?: number; keepTogether?: boolean } = {}) {
    const { shade = false, size = 10.7, headingSize = 16, gap = 3 } = options;
    const pad = shade ? options.padding ?? 14 : 0, w = width - pad * 2;
    const wholeHeight = (label ? measure(label, headingSize, w, "Brand") + 8 : 0) + measure(value, size, w, "Body", gap) + pad * 2 + 12;
    if (options.keepTogether && wholeHeight <= bodyBottom - bodyTop) ensure(wholeHeight);
    let remaining = value || "No informado", continuation = false;
    while (remaining.length) {
      const heading = label + (continuation ? " (continuación)" : "");
      const headingHeight = label ? measure(heading, headingSize, w, "Brand") + 8 : 0;
      ensure(headingHeight + pad * 2 + 35);
      const chunk = prefix(remaining, bodyBottom - y - headingHeight - pad * 2 - 12, size, w, "Body", gap);
      if (!chunk) { nextPage(); continue; }
      const height = measure(chunk, size, w, "Body", gap), startY = y;
      if (shade) panel(left, y, width, headingHeight + height + pad * 2, C.pale);
      if (label) text(heading, left + pad, y + pad, w, headingSize, "Brand");
      text(chunk, left + pad, y + pad + headingHeight, w, size, "Body", C.ink, "left", gap);
      y += headingHeight + height + pad * 2 + 12;
      sectionSegments.push({ label, page: pages, startY, endY: y, characters: chunk.length });
      remaining = remaining.slice(chunk.length); continuation = true;
      if (remaining) nextPage();
    }
  }
  function fields(cells: Array<{ label: string; value: string }>) {
    const w = (width - (cells.length - 1) * 16) / cells.length;
    const height = Math.max(...cells.map((cell) => measure(cell.value, 10.7, w, "Medium"))) + 29;
    if (height > bodyBottom - bodyTop) { cells.forEach((cell) => block(cell.label, cell.value, { headingSize: 12 })); return; }
    ensure(height);
    cells.forEach((cell, i) => {
      text(cell.label, left + i * (w + 16), y, w, 9, "Body", C.muted);
      text(cell.value, left + i * (w + 16), y + 17, w, 10.7, "Medium");
      sectionSegments.push({ label: cell.label, page: pages, startY: y, endY: y + height, characters: cell.value.length });
    });
    y += height;
  }

  header();
  if (data.kind === "intake") {
    block("Cliente", `${d.name} / Celular: ${d.phone || "No informado"}`, { size: 10.7 });
    block("", `Domicilio: ${d.address}`, { size: 10, gap: 2 });
    line(y - 3); y += 10;
    block("Equipo recibido", d.equipment, { size: 12 });
    fields([{ label: "Modelo", value: d.model }, { label: "Número de serie", value: d.serial }, { label: "Color", value: d.color }]);
    block("Accesorios entregados", d.accessories, { shade: true, headingSize: 12, padding: 10 });
    block("Falla informada", d.fault);
    block("", `Estado exterior: ${d.condition}`, { size: 9.5 });
    ensure(130); line(y); y += 10;
    block("Retiro del equipo / plazo de 90 días", `${d.policyStatus}\n${d.policy}`, { size: 8.55, headingSize: 14, gap: 1.5, keepTogether: true });
  } else {
    block("", d.name, { size: 12 });
    block("", `${d.equipment} / ${d.model}\nSerie ${d.serial} / Color ${d.color}`, { size: 10.7, gap: 2 });
    line(y - 3); y += 10;
    block("Detalle del presupuesto", d.budgetDetail, { size: 11.7, gap: 4 });
    ensure(100);
    panel(left, y, 251, 68, C.ink);
    text("Monto total del presupuesto", left + 14, y + 11, 223, 9.4, "Body", "#D8E2DF");
    const total = data.amount === null ? "Sin presupuesto" : formatCurrency(data.amount);
    let totalSize = data.amount === null ? 17 : 25;
    while (doc.font("Brand").fontSize(totalSize).widthOfString(total) > 223 && totalSize > 9) totalSize--;
    text(total, left + 14, y + 34, 223, totalSize, "Brand", C.white);
    // The compact payment column matches the approved design. Large lists use full-width pagination.
    const paymentLines = d.payments.map((p) => `${displayDate(p.date)} / ${formatCashMethod(p.method)}: ${formatCurrency(p.amount)}`);
    const compact = paymentLines.length <= 2 && paymentLines.every((v) => measure(v, 8.3, 256, "Body", 1) <= 23);
    if (compact) {
      text("Pagos registrados", 305, y + 1, 256, 12, "Brand");
      text(paymentLines.length ? paymentLines.join("\n") : "Sin pagos registrados.", 305, y + 25, 256, 8.3, "Body", C.ink, "left", 5);
    }
    y += 82;
    if (!compact) block("Pagos registrados", paymentLines.join("\n"), { size: 9.5 });
    if (d.finalTotal !== null && d.finalTotal !== data.amount) block("", `Importe final registrado: ${formatCurrency(d.finalTotal)}`, { size: 10 });
    fields([{ label: "Total abonado", value: formatCurrency(d.paidTotal) },
      { label: d.credit > 0 ? "Importe abonado en exceso" : "Saldo pendiente", value: d.credit > 0 ? formatCurrency(d.credit) : d.balance === null ? "Importe final sin registrar" : formatCurrency(d.balance) }]);
    const w = d.warranty;
    const coverage = w.days !== null
      ? `${w.days} días\nDesde ${displayDate(w.startsOn)} hasta ${displayDate(w.expiresOn)}\n\n${w.conditions}`
      : w.status === "none" ? "Sin garantía registrada para esta reparación."
        : "Garantía pendiente de revisión de sus datos. Consultá al local para confirmar la cobertura.";
    block("Garantía de reparación", `${coverage}\n\nPara revisión: WhatsApp 3571 544683. Indicá tu orden ${data.number}.`, { shade: true, size: 9.8, headingSize: 18, gap: 2 });
    block("", `CHETECH registra el retiro del equipo el ${displayDate(data.date)}.`, { size: 9.6 });
  }

  const range = doc.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    doc.switchToPage(range.start + page);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    line(footerY);
    text("Atendido por Nazareno Malpassi", left, footerY + 11, width, 10.3, "Medium");
    text(`Documento digital generado el ${issued} (Argentina).`, left, footerY + 29, width, 8.4, "Body", C.muted, "left", 0);
    text(`${data.number} / Documento interno no fiscal / ${page + 1} de ${range.count}`, left, footerY + 45, width, 7.9, "Body", C.muted, "left", 0);
    doc.page.margins.bottom = bottom;
  }
  return { pages, pageHeaders: pages, bodyTop, bodyBottom, footerY, signature: null,
    renderedSectionCharacters: sectionSegments.reduce((sum, part) => sum + part.characters, 0), sectionSegments };
}
