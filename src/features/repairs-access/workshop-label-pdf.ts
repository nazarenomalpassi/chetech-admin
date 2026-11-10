import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { OPERATIONAL_TIME_ZONE, toDisplayDate } from "@/lib/utils";

export type WorkshopLabelData = {
  number: string;
  customerName: string;
  device: string;
  issueReported: string;
  accessories: string;
  intakeDate: string;
  orderUrl: string;
};

const MM = 72 / 25.4;
const PAGE = { width: 80 * MM, height: 50 * MM, margin: 3 * MM };
const TRUNCATION = "... Ver ficha";

function compact(value: string) {
  return value.normalize("NFC").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
}

function intakeDate(value: string) {
  const date = toDisplayDate(value);
  if (!Number.isFinite(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: OPERATIONAL_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

// This trusted brand asset contains only untransformed SVG paths and a polygon.
// Render its actual outlines (not a recreated wordmark), cropped to the artwork.
function drawLogo(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, width: number) {
  doc.save().translate(x, y).scale(width / 694.47).translate(-73.71, -238.84);
  for (const [, tag, attributes] of svg.matchAll(/<(path|polygon)\b([^>]+)>/g)) {
    if (tag === "path") {
      const outline = attributes.match(/\bd="([^"]+)"/)?.[1];
      if (outline) doc.path(outline).fill("#000000");
    } else {
      const points = attributes.match(/\bpoints="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
      if (points?.length) {
        doc.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) doc.lineTo(points[i], points[i + 1]);
        doc.closePath().fill("#000000");
      }
    }
  }
  doc.restore();
}

function drawQr(doc: PDFKit.PDFDocument, qr: QRCode.QRCode, url: string) {
  const x = PAGE.margin, y = 47, side = 26 * MM;
  const quiet = 4;
  const step = side / (qr.modules.size + quiet * 2);
  doc.save().rect(x, y, side, side).fill("#FFFFFF");
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) doc.rect(x + (col + quiet) * step, y + (row + quiet) * step, step, step);
    }
  }
  doc.fill("#000000").restore();
  doc.link(x, y, side, side, url);
}

function renderLabel(doc: PDFKit.PDFDocument, data: WorkshopLabelData, qr: QRCode.QRCode) {
  const asset = (name: string) => readFileSync(path.join(process.cwd(), "public/brand", name));
  doc.registerFont("Body", asset("InputSans.otf"));
  doc.registerFont("Medium", asset("InputSans-Medium.otf"));

  // Lay out measured single lines explicitly: PDFKit must never paginate a sticker.
  function field(value: string, x: number, y: number, width: number, size: number, font = "Body", maxLines = 1) {
    doc.font(font).fontSize(size).fillColor("#000000");
    const lineHeight = doc.currentLineHeight(true) + 0.5;
    let remaining = Array.from(value);
    function prefixLength(suffix = "") {
      let low = 0, high = remaining.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (doc.widthOfString(remaining.slice(0, mid).join("").trimEnd() + suffix) <= width) low = mid;
        else high = mid - 1;
      }
      return low;
    }
    for (let line = 0; line < maxLines && remaining.length; line++) {
      let length = prefixLength();
      const truncated = length < remaining.length && line === maxLines - 1;
      if (truncated) length = prefixLength(TRUNCATION);
      else if (length < remaining.length) {
        const boundary = remaining.lastIndexOf(" ", length - 1);
        if (boundary > length / 2) length = boundary;
      }
      const text = remaining.slice(0, length).join("").trimEnd() + (truncated ? TRUNCATION : "");
      doc.text(text, x, y + line * lineHeight, { width, lineBreak: false });
      if (truncated) break;
      remaining = remaining.slice(length);
      while (remaining[0] === " ") remaining.shift();
    }
  }

  const left = PAGE.margin, right = PAGE.width - PAGE.margin;
  const logoWidth = 64, logoLeft = right - logoWidth;
  const numberWidth = logoLeft - left - 6;
  const number = compact(data.number) || "Sin número";
  let numberSize = 18;
  while (doc.font("Medium").fontSize(numberSize).widthOfString(number) > numberWidth && numberSize > 12) numberSize -= 0.5;
  field("ORDEN DE SERVICIO", left, PAGE.margin, numberWidth, 5.6, "Medium");
  field(number, left, 18.5, numberWidth, numberSize, "Medium");
  drawLogo(doc, asset("chetech-horizontal-black.svg").toString("utf8"), logoLeft, 22, logoWidth);
  doc.save().moveTo(left, 42).lineTo(right, 42).lineWidth(0.45).strokeColor("#000000").stroke().restore();

  drawQr(doc, qr, data.orderUrl);
  const textLeft = 33 * MM, width = right - textLeft;
  field(compact(data.customerName) || "Sin cliente informado", textLeft, 47, width, 8.5, "Medium");
  field(compact(data.device) || "Sin equipo informado", textLeft, 59, width, 6.8);
  field("FALLA REPORTADA", textLeft, 72, width, 6.5, "Medium");
  field(compact(data.issueReported) || "Sin falla informada", textLeft, 83, width, 9.3, "Medium", 2);
  field(`Acc.: ${compact(data.accessories) || "Sin accesorios"}`, textLeft, 112, width, 6.8);
  field(`INGRESO ${intakeDate(data.intakeDate)}`, left, 125, right - left, 6.2, "Medium");
}

/** Server-only, read-only PDF generation. The caller supplies the authenticated detail URL. */
export async function generateWorkshopLabelPdf(data: WorkshopLabelData): Promise<Buffer> {
  let url: URL;
  try { url = new URL(data.orderUrl); } catch { throw new Error("La URL de la orden debe ser absoluta HTTP(S)."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("La URL de la orden debe ser absoluta HTTP(S).");
  const qr = QRCode.create(data.orderUrl, { errorCorrectionLevel: "M" });
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height], margin: PAGE.margin,
    info: { Title: `CHETECH - ${data.number} - Etiqueta de taller`, Author: "CHETECH" }
  });
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try { renderLabel(doc, data, qr); doc.end(); }
    catch (error) { doc.destroy(); reject(error); }
  });
}
