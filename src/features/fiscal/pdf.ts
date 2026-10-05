import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { IVA_CONDITIONS, type FiscalRecord } from "./model";

function assertAuthorized(record: FiscalRecord) {
  const auth = record.authorization;
  if (record.status !== "accepted" || !auth || !/^[1-9]\d{13}$/.test(auth.cae) || !record.number ||
    record.number !== auth.number || !/^\d{4}-\d{2}-\d{2}$/.test(auth.expiresOn)) throw new Error("El QR/PDF fiscal requiere un CAE autorizado y persistido.");
  return auth;
}
export function buildFiscalQrUrl(record: FiscalRecord) {
  const auth = assertAuthorized(record), s = record.snapshot;
  const payload = { ver: 1, fecha: s.issuedOn, cuit: Number(s.issuer.cuit), ptoVta: s.pointOfSale,
    tipoCmp: 11, nroCmp: record.number, importe: s.totalCents / 100, moneda: "PES", ctz: 1,
    tipoDocRec: s.receiver.documentType, nroDocRec: Number(s.receiver.documentNumber), tipoCodAut: "E", codAut: Number(auth.cae) };
  return `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString("base64"))}`;
}

export async function generateFiscalPdf(record: FiscalRecord): Promise<Buffer> {
  const auth = assertAuthorized(record), s = record.snapshot;
  const qr = await QRCode.toBuffer(buildFiscalQrUrl(record), { type: "png", width: 280, margin: 1, errorCorrectionLevel: "M" });
  const doc = new PDFDocument({ size: "A4", margin: 38, bufferPages: true, info: {
    Title: `Factura C ${String(s.pointOfSale).padStart(5, "0")}-${String(record.number).padStart(8, "0")}${s.environment === "homologation" ? " - HOMOLOGACION SIN VALIDEZ FISCAL" : ""}`,
    Author: s.issuer.name } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("Body", readFileSync(path.join(process.cwd(), "public/brand/InputSans.otf")));
  doc.registerFont("Brand", readFileSync(path.join(process.cwd(), "public/brand/MONTECHV02-Bold.otf")));
  const left = 38, width = doc.page.width - 76, bottom = doc.page.height - 175;
  const ink = "#202725", line = "#ccd1cb";
  const amount = (cents: number) => `$ ${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = (iso: string) => iso.split("-").reverse().join("/");
  let y = 0;
  const text = (value: string, x: number, at: number, textWidth: number, size = 9) => {
    doc.font("Body").fontSize(size).fillColor(ink).text(value, x, at, { width: textWidth, lineGap: 2 });
    return doc.y;
  };
  function header(first = false) {
    text("ORIGINAL", left, 24, width, 9);
    if (s.environment === "homologation") {
      doc.rect(left, 43, width, 22).fill("#edece6");
      text("HOMOLOGACION - SIN VALIDEZ FISCAL", left + 8, 49, width - 16, 9);
    }
    const top = s.environment === "homologation" ? 80 : 56;
    doc.font("Brand").fontSize(22).fillColor(ink).text("CHETECH", left, top, { width: 205 });
    doc.rect(268, top - 2, 48, 48).strokeColor(ink).stroke();
    doc.font("Brand").fontSize(25).text("C", 280, top + 2, { width: 30 });
    text("COD. 011", 273, top + 32, 41, 6);
    text("FACTURA", 344, top, 210, 17);
    text(`${String(s.pointOfSale).padStart(5, "0")}-${String(record.number).padStart(8, "0")}`, 344, top + 25, 210, 11);
    text(`Fecha de emision: ${date(s.issuedOn)}`, 344, top + 45, 210, 9);
    y = top + 71;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(line).stroke();
    y += 13;
    if (first) {
      y = text(s.issuer.name, left, y, width, 11) + 4;
      y = text(`Domicilio comercial/fiscal: ${s.issuer.address}`, left, y, width) + 3;
      y = text(`CUIT: ${s.issuer.cuit} | IVA: Responsable Monotributo`, left, y, width) + 3;
      y = text(`Ingresos Brutos: ${s.issuer.grossIncome} | Inicio de actividades: ${date(s.issuer.activityStart)}`, left, y, width) + 14;
      y = text(`Receptor: ${s.receiver.name}`, left, y, width, 10) + 3;
      y = text(`Domicilio: ${s.receiver.address}`, left, y, width) + 3;
      y = text(`${s.receiver.documentType === 80 ? "CUIT" : "DNI"}: ${s.receiver.documentNumber} | IVA: ${IVA_CONDITIONS.find(([id]) => id === s.receiver.ivaCondition)?.[1] ?? s.receiver.ivaCondition}`, left, y, width) + 3;
      y = text(`Concepto: ${s.concept === 1 ? "Productos" : s.concept === 2 ? "Servicios" : "Productos y servicios"} | Moneda: pesos argentinos`, left, y, width) + 3;
      if (s.concept !== 1) y = text(`Periodo: ${date(s.serviceFrom!)} al ${date(s.serviceTo!)} | Vencimiento de pago: ${date(s.paymentDue!)}`, left, y, width) + 3;
      y = text(`Documento interno vinculado: ${s.invoiceNumber}`, left, y, width, 8) + 15;
    } else y = text(`Continuacion | CUIT emisor ${s.issuer.cuit} | Receptor ${s.receiver.documentNumber}`, left, y, width, 8) + 15;
  }
  function columns() {
    doc.rect(left, y, width, 24).fill("#f0f1ec");
    text("Descripcion", left + 7, y + 7, 270, 8);
    text("Cantidad", 319, y + 7, 48, 8);
    text("P. unitario", 385, y + 7, 80, 8);
    text("Importe", 482, y + 7, 75, 8);
    y += 34;
  }
  function nextPage() { doc.addPage(); header(); columns(); }
  const height = (value: string, textWidth = 266) => doc.font("Body").fontSize(9).heightOfString(value, { width: textWidth, lineGap: 2 });
  function prefix(value: string, available: number) {
    let low = 1, high = value.length, count = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (height(value.slice(0, mid)) <= available) { count = mid; low = mid + 1; } else high = mid - 1;
    }
    if (!count) throw new Error("No hay espacio para el detalle del PDF.");
    return value.slice(0, count);
  }
  header(true); columns();
  for (const item of s.items) {
    let remaining = item.description, first = true;
    while (remaining) {
      if (bottom - y < 36) nextPage();
      const part = prefix(remaining, bottom - y - 14), rowHeight = Math.max(24, height(part) + 14);
      text(part, left + 7, y + 4, 266);
      if (first) {
        text(String(item.quantity), 319, y + 4, 48, 8);
        text(amount(item.unitPriceCents), 385, y + 4, 80, 8);
        text(amount(item.totalCents), 482, y + 4, 75, 8);
      }
      y += rowHeight;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(line).stroke();
      remaining = remaining.slice(part.length); first = false;
      if (remaining) nextPage();
    }
    y += 5;
  }
  if (y + 105 > bottom) { doc.addPage(); header(); }
  y += 10;
  y = text(`Subtotal: ${amount(s.subtotalCents)}`, 330, y, 220, 10) + 5;
  y = text(`Descuento: ${amount(s.discountCents)}`, 330, y, 220, 10) + 8;
  text(`TOTAL: ${amount(s.totalCents)}`, 330, y, 220, 14);
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page);
    const footer = doc.page.height - 145;
    doc.moveTo(left, footer - 9).lineTo(left + width, footer - 9).strokeColor(line).stroke();
    doc.image(qr, left, footer, { width: 94, height: 94 });
    text(`CAE: ${auth.cae}`, 149, footer + 12, 370, 11);
    text(`Vencimiento del CAE: ${date(auth.expiresOn)}`, 149, footer + 36, 370);
    text(s.environment === "production" ? "Comprobante autorizado por ARCA. IVA no discriminado." : "Autorizacion de pruebas. No utilizar como comprobante fiscal real.", 149, footer + 59, 370, 8);
    text(`Pagina ${page - range.start + 1} de ${range.count}`, 149, footer + 87, 370, 8);
  }
  doc.end();
  return finished;
}
