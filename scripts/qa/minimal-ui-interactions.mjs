import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = "http://127.0.0.1:3001";
const output = path.resolve("tmp/qa/minimal-ui-20261008");

async function main() {
  const health = await fetch("http://127.0.0.1:54341/health").then(r => r.json());
  assert.equal(health.staging, true);
  assert.equal(health.database, "chetech_staging");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill("admin@staging.invalid");
    await page.getByLabel("Contraseña", { exact: true }).fill("Chetech-staging-only-20261005!");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");

    await page.goto(base + "/productos", { waitUntil: "networkidle" });
    const search = page.getByRole("textbox", { name: "Buscar productos" });
    await search.pressSequentially("CHETECH", { delay: 70 });
    await page.waitForURL("**/productos?**search=CHETECH**");
    assert.equal(await search.inputValue(), "CHETECH");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Prueba sin guardar");
    page.once("dialog", dialog => dialog.dismiss());
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).inputValue(), "Prueba sin guardar");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Nuevo producto" }).evaluate(node => document.activeElement === node), true);

    await page.goto(base + "/reparaciones-access?view=ordenes", { waitUntil: "networkidle" });
    const orderSearch = page.getByRole("textbox", { name: "Buscar orden de service" });
    await orderSearch.pressSequentially("Belén ", { delay: 80 });
    await page.waitForTimeout(900);
    assert.equal(await orderSearch.inputValue(), "Belén ");
    await orderSearch.fill("");
    await page.getByRole("combobox", { name: "Filtrar ordenes por estado" }).selectOption("pendiente_revision");
    await page.waitForLoadState("networkidle");
    const card = page.locator("article").filter({ has: page.getByText("Falla reportada", { exact: true }) }).first();
    assert.equal(await card.locator("a[href^='https://wa.me'],a[href^='tel:']").filter({ visible: true }).count(), 0);
    const update = card.locator("summary").filter({ hasText: "Actualizar trabajo" });
    await update.click();
    const status = card.getByRole("combobox", { name: /Estado de la orden/ });
    for (const value of ["presupuestado_aceptado", "presupuestado_rechazado", "retirado"]) {
      await status.selectOption(value);
      assert.equal(await status.inputValue(), value);
    }
    await page.screenshot({ path: path.join(output, "repair-quick-retirement-mobile.png") });

    page.once("dialog", dialog => dialog.accept());
    await page.goto(base + "/ventas", { waitUntil: "networkidle" });
    const amount = page.locator("#payment-amount-0");
    await amount.fill("15000,");
    assert.equal(await amount.inputValue(), "15000,");
    await amount.fill("15000,25");
    assert.equal(await amount.inputValue(), "15000,25");
    await page.getByRole("button", { name: "Agregar medio", exact: true }).click();
    await page.locator("#payment-method-1").selectOption("nx");
    await page.locator("#payment-amount-1").fill("10000");
    assert.equal(await page.locator("#payment-amount-0").inputValue(), "15000.25");
    await page.screenshot({ path: path.join(output, "sales-split-mobile.png") });
    assert.equal(errors.length, 0);
    await fs.writeFile(path.join(output, "interactions.json"), JSON.stringify({ passed: ["mobile login", "product search persistence", "modal discard guard and focus", "accented repair typing", "quick accepted/rejected/pickup selection", "hidden personal mobile contacts", "single and split comma-decimal payments"], errors }, null, 2));
    console.log("PASS mobile typing, filters, modal draft/focus, technical states and single/split payment entry. No real or synthetic financial writes.");
  } catch (error) {
    await page.screenshot({ path: path.join(output, "interaction-failure.png") });
    console.error(await page.locator("article").first().innerText().catch(() => "No article visible"));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
