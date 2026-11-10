import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorkshopLabelPdf, generateWorkshopLabelPreview } from "./workshop-label-pdf";

const mm = 72 / 25.4;
const sample = {
  number: "REP-000742",
  customerName: "Lucía Fernández",
  device: 'Samsung UN43J5200AG - 43"',
  issueReported: "Tiene sonido, pero no imagen.",
  accessories: "Control remoto + cable",
  intakeDate: "2026-11-10",
  orderUrl: "https://chetech-admin.vercel.app/reparaciones-access?view=detalle&order=00000000-0000-4000-8000-000000000742"
};

// Observe real PDFKit output without replacing font metrics or the PDF stream.
function observeText() {
  const original = PDFDocument.prototype.text;
  const lines: Array<{ text: string; x: number; y: number; width: number; height: number; size: number; options: PDFKit.Mixins.TextOptions }> = [];
  vi.spyOn(PDFDocument.prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: Parameters<typeof original>) {
    const [value, x, y, options] = args as [string, number, number, PDFKit.Mixins.TextOptions];
    lines.push({
      text: value, x, y, width: this.widthOfString(value), height: this.currentLineHeight(true),
      size: (this as PDFKit.PDFDocument & { _fontSize: number })._fontSize, options
    });
    return original.apply(this, args);
  });
  return lines;
}

function expectOneLabel(pdf: Buffer) {
  expect(Buffer.isBuffer(pdf)).toBe(true);
  const source = pdf.toString("latin1");
  expect(source.startsWith("%PDF-")).toBe(true);
  expect(source).toContain("%%EOF");
  expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
  const box = source.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  expect(box).not.toBeNull();
  expect(Number(box![1])).toBeCloseTo(80 * mm, 4);
  expect(Number(box![2])).toBeCloseTo(50 * mm, 4);
}

function expectSafeLines(lines: ReturnType<typeof observeText>) {
  for (const line of lines) {
    expect(line.text).not.toMatch(/[\r\n\u0000]/);
    expect(line.options.lineBreak).toBe(false);
    expect(line.x).toBeGreaterThanOrEqual(3 * mm - 0.01);
    expect(line.y).toBeGreaterThanOrEqual(3 * mm - 0.01);
    expect(line.x + line.width).toBeLessThanOrEqual(77 * mm + 0.01);
    expect(line.y + line.height).toBeLessThanOrEqual(47 * mm + 0.01);
    expect(line.width).toBeLessThanOrEqual(line.options.width! + 0.01);
  }
  for (let i = 0; i < lines.length; i++) {
    for (const other of lines.slice(i + 1)) {
      const line = lines[i];
      const overlapsX = Math.min(line.x + line.width, other.x + other.width) - Math.max(line.x, other.x) > 0.01;
      const overlapsY = Math.min(line.y + line.height, other.y + other.height) - Math.max(line.y, other.y) > 0.01;
      expect(overlapsX && overlapsY, `Overlapping text: ${line.text} / ${other.text}`).toBe(false);
    }
  }
}

afterEach(() => vi.restoreAllMocks());

describe("80 x 50 mm workshop label PDF", () => {
  it("identifies an accessory separately without changing the REP or its QR", async () => {
    const lines = observeText();
    const qr = vi.spyOn(QRCode, "create");
    expectOneLabel(await generateWorkshopLabelPdf({ ...sample, variant: "accessory", accessoryDescription: "Control remoto negro", accessoryIndex: 2 }));
    const text = lines.map(line => line.text).join(" ");
    expect(text).toContain("ACCESORIO A2");
    expect(text).toContain("Control remoto negro");
    expect(lines.some(line => line.text === sample.number)).toBe(true);
    expect(text).not.toContain(sample.issueReported);
    expect(qr).toHaveBeenCalledWith(sample.orderUrl, expect.anything());
    expectSafeLines(lines);
  });

  it("distinguishes an active warranty return while using its supplied fault, date and accessories", async () => {
    const lines = observeText();
    expectOneLabel(await generateWorkshopLabelPdf({ ...sample, variant: "warranty", issueReported: "Volvio sin sonido", intakeDate: "2026-11-15", accessories: "Sin control" }));
    const text = lines.map(line => line.text).join(" ");
    expect(text).toContain("REINGRESO EN GARANTIA");
    expect(text).toContain("FALLA DEL REINGRESO");
    expect(text).toContain("Volvio sin sonido");
    expect(text).toContain("REINGRESO 15/11/2026");
    expect(text).toContain("Sin control");
    expect(text).not.toContain(sample.issueReported);
    expect(lines.some(line => line.text === sample.number)).toBe(true);
    expectSafeLines(lines);
  });

  it.each(["accessory", "warranty"] as const)("keeps long %s text on one label without overlap or source mutation", async variant => {
    const long = "Detalle de prueba sin cortar datos originales. ".repeat(100);
    const lines = observeText();
    const data = Object.freeze({ ...sample, variant, accessoryDescription: long, accessoryIndex: 99, issueReported: long, accessories: long });
    expectOneLabel(await generateWorkshopLabelPdf(data));
    expect(lines.some(line => variant === "accessory" ? line.text === "Descripcion recortada" : line.text.endsWith("... Ver ficha"))).toBe(true);
    expect(data.issueReported).toBe(long);
    expectSafeLines(lines);
  });

  it.each(["Detalle muy largo de accesorio. ".repeat(100), "W".repeat(120), "Control\nremoto\t".repeat(20)])("marks a cropped temporary description without promising its full text in the order", async accessoryDescription => {
    const lines = observeText();
    const result = await generateWorkshopLabelPreview({ ...sample, variant: "accessory", accessoryDescription, accessoryIndex: 1 });
    expectOneLabel(result.pdf);
    expect(result.accessoryDescriptionTruncated).toBe(true);
    const text = lines.map(line => line.text).join(" ");
    expect(text).toContain("Descripcion recortada");
    expect(text).not.toContain("Ver ficha");
    expect(lines.some(line => line.text.endsWith("..."))).toBe(true);
    expectSafeLines(lines);
  });

  it("does not flag a complete accessory description or a saved equipment fault as temporary truncation", async () => {
    const short = await generateWorkshopLabelPreview({ ...sample, variant: "accessory", accessoryDescription: "Control", accessoryIndex: 1 });
    expect(short.accessoryDescriptionTruncated).toBe(false);
    const lines = observeText();
    const equipment = await generateWorkshopLabelPreview({ ...sample, issueReported: "Falla original extensa. ".repeat(100) });
    expect(equipment.accessoryDescriptionTruncated).toBe(false);
    expect(lines.some(line => line.text.endsWith("... Ver ficha"))).toBe(true);
    expect(lines.some(line => line.text === "Descripcion recortada")).toBe(false);
  });

  it("returns one complete, exact-size page with both embedded InputSans fonts", async () => {
    const pdf = await generateWorkshopLabelPdf(sample);
    expectOneLabel(pdf);
    expect(pdf.toString("latin1")).toContain("InputSans-Regular");
    expect(pdf.toString("latin1")).toContain("InputSans-Medium");
    expect(pdf.toString("latin1").match(/\/FontFile[23]\b/g)).toHaveLength(2);
  });

  it("prints the original REP unchanged and prioritizes the reported fault, not a diagnosis or budget", async () => {
    const lines = observeText();
    await generateWorkshopLabelPdf(sample);
    expect(lines.map((line) => line.text).join(" ")).toContain(sample.issueReported);
    expect(lines.map((line) => line.text).join(" ")).toContain(sample.customerName);
    expect(lines.map((line) => line.text).join(" ")).toContain(sample.device);
    expect(lines.map((line) => line.text).join(" ")).toContain(sample.accessories);
    expect(lines.some((line) => line.text === "FALLA REPORTADA")).toBe(true);
    expect(lines.some((line) => line.text === "INGRESO 10/11/2026")).toBe(true);
    expect(lines.find((line) => line.text === sample.number)!.size).toBeGreaterThanOrEqual(18);
    expect(lines.find((line) => sample.issueReported.startsWith(line.text))!.size)
      .toBeGreaterThan(lines.find((line) => line.text === sample.customerName)!.size);
    expect(lines.map((line) => line.text).join(" ")).not.toMatch(/Presupuesto|Garantía|Diagnóstico|MUESTRA|DEMO/);
    expectSafeLines(lines);
  });

  it("draws the original horizontal SVG logo as vectors without adding an image over the QR", async () => {
    const paths = vi.spyOn(PDFDocument.prototype, "path");
    const images = vi.spyOn(PDFDocument.prototype, "image");
    await generateWorkshopLabelPdf(sample);
    const svg = readFileSync("public/brand/chetech-horizontal-black.svg", "utf8");
    for (const [, originalPath] of svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
      expect(paths.mock.calls.some(([value]) => value === originalPath)).toBe(true);
    }
    expect(images).not.toHaveBeenCalled();
  });

  it.each([
    { variant: "equipment" },
    { variant: "accessory", accessoryDescription: "Control", accessoryIndex: 1 },
    { variant: "warranty" }
  ] as const)("encodes exactly the caller's detail URL with four blank modules and pure black vector modules for $variant", async variant => {
    const create = vi.spyOn(QRCode, "create");
    const rectangles = vi.spyOn(PDFDocument.prototype, "rect");
    const fill = vi.spyOn(PDFDocument.prototype, "fill");
    const link = vi.spyOn(PDFDocument.prototype, "link");
    await generateWorkshopLabelPdf({ ...sample, ...variant });
    expect(create).toHaveBeenCalledWith(sample.orderUrl, expect.objectContaining({ errorCorrectionLevel: "M" }));
    const matrix = create.mock.results[0].value.modules as QRCode.BitMatrix;
    const side = 26 * mm;
    const moduleSize = side / (matrix.size + 8);
    const rectCalls = rectangles.mock.calls as [number, number, number, number][];
    const backgrounds = rectCalls.filter(([, , w, h]) => Math.abs(w - side) < 0.001 && Math.abs(h - side) < 0.001);
    expect(backgrounds).toHaveLength(1);
    const [left, top] = backgrounds[0];
    const modules = rectCalls.filter(([, , w, h]) => Math.abs(w - moduleSize) < 0.0001 && Math.abs(h - moduleSize) < 0.0001);
    const actual = new Set(modules.map(([x, y]) => `${Math.round((y - top) / moduleSize) - 4}:${Math.round((x - left) / moduleSize) - 4}`));
    let dark = 0;
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        expect(actual.has(`${row}:${col}`)).toBe(Boolean(matrix.get(row, col)));
        dark += matrix.get(row, col) ? 1 : 0;
      }
    }
    expect(modules).toHaveLength(dark);
    expect(Math.min(...modules.map(([x]) => x)) - left).toBeCloseTo(4 * moduleSize, 6);
    expect(Math.min(...modules.map(([, y]) => y)) - top).toBeCloseTo(4 * moduleSize, 6);
    expect(left + side - Math.max(...modules.map(([x, , w]) => x + w))).toBeCloseTo(4 * moduleSize, 6);
    expect(top + side - Math.max(...modules.map(([, y, , h]) => y + h))).toBeCloseTo(4 * moduleSize, 6);
    expect(fill.mock.calls.some(([color]) => color === "#000000")).toBe(true);
    expect(fill.mock.calls.some(([color]) => color === "#FFFFFF")).toBe(true);
    expect(link).toHaveBeenCalledWith(left, top, side, side, sample.orderUrl);
    expect(left).toBeGreaterThanOrEqual(3 * mm);
    expect(top + side).toBeLessThan(47 * mm);
  });

  it.each(["words", "unbroken", "newlines"] as const)("explicitly truncates overflowing %s without another page or changing source data", async (kind) => {
    const content = kind === "words" ? "Detalle muy extenso de recepción. ".repeat(160)
      : kind === "unbroken" ? "ÁÑ0123456789".repeat(300) : "Un dato\nOtro dato\tMás datos\r\n".repeat(150);
    const data = Object.freeze({ ...sample, customerName: content, device: content, issueReported: content, accessories: content });
    const lines = observeText();
    const pdf = await generateWorkshopLabelPdf(data);
    expectOneLabel(pdf);
    expect(lines.filter((line) => line.text.endsWith("... Ver ficha"))).toHaveLength(4);
    expect(lines.map((line) => line.text).join(" ")).not.toContain(content);
    expect(data.issueReported).toBe(content);
    expect(data.accessories).toBe(content);
    expectSafeLines(lines);
  });

  it("keeps an exceptionally long REP inside the header without silently cutting it", async () => {
    const lines = observeText();
    expectOneLabel(await generateWorkshopLabelPdf({ ...sample, number: `REP-${"1234567890".repeat(30)}` }));
    expect(lines.some((line) => line.text.startsWith("REP-") && line.text.endsWith("... Ver ficha"))).toBe(true);
    expectSafeLines(lines);
  });

  it("handles blank optional fields and malformed dates without invented customer data", async () => {
    const lines = observeText();
    expectOneLabel(await generateWorkshopLabelPdf({ ...sample, customerName: " ", device: "", issueReported: "\n", accessories: "\t", intakeDate: "not-a-date" }));
    expect(lines.some((line) => line.text === "Sin cliente informado")).toBe(true);
    expect(lines.some((line) => line.text === "Sin equipo informado")).toBe(true);
    expect(lines.map((line) => line.text).join(" ")).toContain("Sin falla informada");
    expect(lines.map((line) => line.text).join(" ")).toContain("Sin accesorios");
    expect(lines.some((line) => line.text === "INGRESO Sin fecha")).toBe(true);
    expectSafeLines(lines);
  });

  it.each(["2026-11-10", "2026-11-10T00:00:00Z", "2026-11-10T12:30:00-03:00"])("keeps the operational intake date for %s", async (intakeDate) => {
    const lines = observeText();
    await generateWorkshopLabelPdf({ ...sample, intakeDate });
    expect(lines.some((line) => line.text === "INGRESO 10/11/2026")).toBe(true);
  });

  it("retains accents, removes control whitespace and never writes hidden content outside the label", async () => {
    const lines = observeText();
    const pdf = await generateWorkshopLabelPdf({ ...sample, customerName: "  José\tMuñoz\u0000  ", issueReported: "No enciende.\nRevisar tensión.", accessories: "Cable\r\ny control" });
    expect(lines.some((line) => line.text === "José Muñoz")).toBe(true);
    expect(lines.map((line) => line.text).join(" ")).toContain("Revisar tensión.");
    expectSafeLines(lines);
    // The emitted page content is vector/text; no raster QR or hidden second page.
    const source = pdf.toString("latin1");
    expect(source).not.toContain("/Subtype /Image");
    const streams = [...source.matchAll(/<<[^]*?\/Filter \/FlateDecode[^]*?>>\s*stream\r?\n([^]*?)\r?\nendstream/g)];
    expect(streams.some(([, stream]) => {
      try { return inflateSync(Buffer.from(stream, "latin1")).toString().includes(" re"); } catch { return false; }
    })).toBe(true);
  });

  it.each(["", "javascript:alert(1)", "/reparaciones-access?view=detalle&order=123"])("rejects a non-absolute HTTP(S) order URL: %s", async (orderUrl) => {
    await expect(generateWorkshopLabelPdf({ ...sample, orderUrl })).rejects.toThrow(/URL/i);
  });

  it("rejects rendering errors instead of returning a partial PDF", async () => {
    vi.spyOn(PDFDocument.prototype, "path").mockImplementation(() => { throw new Error("logo render failure"); });
    await expect(generateWorkshopLabelPdf(sample)).rejects.toThrow("logo render failure");
  });
});
