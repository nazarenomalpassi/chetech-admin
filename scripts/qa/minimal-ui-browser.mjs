import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = "http://127.0.0.1:3001";
const output = path.resolve("tmp/qa/minimal-ui-20261008");
const routes = ["dashboard", "productos", "ventas", "gastos", "visitas", "placas-tv", "sueldos", "cuotas", "caja", "cambio-balance", "reportes", "reparaciones", "reparaciones-access?view=ordenes", "pedidos", "terciarizaciones", "facturacion", "configuracion"];
const quick = process.argv.includes("--quick");
const zoom = process.argv.includes("--zoom");

async function main() {
  const health = await fetch("http://127.0.0.1:54341/health").then(r => r.json());
  assert.equal(health.staging, true);
  assert.equal(health.database, "chetech_staging");
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.CHETECH_BROWSER_CHANNEL || "chrome" });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const samples = [];
  try {
    await page.goto(base + "/login");
    await page.getByLabel(/email|correo/i).fill("admin@staging.invalid");
    await page.getByLabel("Contraseña", { exact: true }).fill("Chetech-staging-only-20261005!");
    await page.getByRole("button", { name: /^Ingresar$/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 60000 });
    for (const width of zoom ? [1366] : quick ? [390, 1024, 1366] : [360, 390, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of quick ? ["dashboard", "productos", "reparaciones-access?view=ordenes"] : routes) {
        const started = Date.now();
        await page.goto(`${base}/${route}`, { waitUntil: "networkidle", timeout: 60000 });
        await page.locator("#main-content").waitFor({ timeout: 60000 });
        if (zoom) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        const sample = await page.evaluate(() => {
          const root = document.documentElement;
          const main = document.querySelector("#main-content");
          const fields = [...main.querySelectorAll("input:not([type=hidden]),select,textarea")].filter(node => node.getClientRects().length);
          const buttons = [...main.querySelectorAll("button,a,summary")].filter(node => node.getClientRects().length).map(node => ({ text: node.getAttribute("aria-label") || node.textContent.trim(), tag: node.tagName, disabled: node.disabled || false }));
          const references = [...main.querySelectorAll("button,a,h1,h2,h3,p")].filter(node => /^REP-\d+$/.test(node.textContent.trim())).map(node => ({ text: node.textContent.trim(), fits: node.scrollWidth <= node.clientWidth + 1 }));
          const clippedActions = [...main.querySelectorAll("button,a,summary")].filter(node => {
            const rect = node.getBoundingClientRect();
            if (!rect.width || rect.left >= -1 && rect.right <= innerWidth + 1) return false;
            for (let parent = node.parentElement; parent && parent !== main; parent = parent.parentElement) {
              if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) return false;
            }
            return true;
          }).map(node => node.getAttribute("aria-label") || node.textContent.trim());
          return { width: innerWidth, overflow: root.scrollWidth > root.clientWidth + 1, title: main.querySelector("h1,h2")?.textContent.trim(), fields: fields.length, unlabelled: fields.filter(node => !node.labels?.length && !node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby")).map(node => node.name || node.id || node.type), buttons, references, clippedActions };
        });
        samples.push({ route, ...sample, navigationMs: Date.now() - started });
        const name = route.split("?")[0];
        if (["dashboard", "productos", "reparaciones-access?view=ordenes", "ventas", "facturacion"].includes(route)) await page.screenshot({ path: path.join(output, `${name}-${width}${zoom ? "-text200" : ""}.png`) });
        console.log(`${width}px ${route}: ${sample.overflow ? "OVERFLOW" : "OK"}, ${sample.fields} fields, ${sample.unlabelled.length} unlabelled`);
      }
    }
    await fs.writeFile(path.join(output, zoom ? "text200.json" : quick ? "quick.json" : "inventory.json"), JSON.stringify({ samples, errors }, null, 2));
    assert.equal(samples.filter(sample => sample.overflow).length, 0, "Document horizontal overflow");
    assert.equal(samples.flatMap(sample => sample.unlabelled).length, 0, "Visible controls need labels");
    assert.equal(samples.flatMap(sample => sample.references).filter(reference => !reference.fits).length, 0, "Complete REP references must fit");
    assert.equal(samples.flatMap(sample => sample.clippedActions).length, 0, "Actions clipped outside their scroll container");
    assert.equal(errors.length, 0, "Browser runtime errors");
    console.log(`PASS ${samples.length} route/viewport checks. Synthetic staging only; no financial records saved.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
