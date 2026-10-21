import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { connectDatabase } from "../staging/db";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = "http://127.0.0.1:3001";
const output = "tmp/qa/warranty-20261019";

async function main() {
  const health = await fetch("http://127.0.0.1:54341/health").then((r) => r.json());
  assert.equal(health.staging, true); assert.equal(health.database, "chetech_staging");
  const db = await connectDatabase();
  const customer = randomUUID(), device = randomUUID(), order = randomUUID(), noFault = randomUUID();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await mkdir(output, { recursive: true });
  try {
    await db.query("insert into public.repair_access_customers(id,full_name,phone) values($1,'BROWSER-WARRANTY synthetic','555123456')", [customer]);
    await db.query("insert into public.repair_access_devices(id,customer_id,device_type,brand,model) values($1,$2,'TV','Synthetic','Browser')", [device, customer]);
    for (const id of [order, noFault]) await db.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported) values($1,$2,$3,'BROWSER-WARRANTY original issue')", [id, customer, device]);
    await db.query("update public.repair_access_orders set status='retirado',picked_up_at=now()-interval '1 day',delivered_at=now()-interval '1 day',budget_amount=100,final_amount=100,budgeted_at=now()-interval '2 days',is_paid=true,paid_at=now()-interval '1 day',payment_method='efectivo',has_warranty=true,warranty_days=30 where id=$1", [order]);
    const original = (await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data;
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill("admin@staging.invalid");
    await page.getByLabel("Contraseña", { exact: true }).fill("Chetech-staging-only-20261005!");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 90000 });
    await page.goto(base + `/reparaciones-access?view=detalle&order=${order}`, { waitUntil: "networkidle" });
    await page.getByText("Registrar reingreso por garantia", { exact: true }).click();
    await page.getByLabel("Falla de este reingreso", { exact: true }).fill("Se apaga otra vez al encender");
    await page.getByLabel("Accesorios recibidos (opcional)").fill("Control y cable");
    await page.getByRole("button", { name: "Registrar reingreso", exact: true }).click();
    await page.getByRole("heading", { name: "Reingreso por garantia activo", exact: true }).waitFor();
    await page.getByRole("button", { name: /Garantias \(/ }).click();
    await page.getByRole("heading", { name: "Reingresos por garantia", exact: true }).waitFor();
    const card = page.locator("article").filter({ hasText: "Se apaga otra vez al encender" });
    await card.getByText("Actualizar reingreso", { exact: true }).click();
    await card.getByLabel("Estado del reingreso", { exact: true }).selectOption("no_presenta_fallas");
    await card.getByLabel("Avance del reingreso", { exact: true }).fill("Equipo probado durante una hora");
    await card.getByRole("button", { name: "Guardar reingreso", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("fieldset[disabled]"));
    await page.waitForTimeout(500);
    assert.equal((await db.query("select status from public.repair_warranty_returns where order_id=$1", [order])).rows[0].status, "no_presenta_fallas");
    await page.screenshot({ path: `${output}/warranty-mobile.png`, fullPage: true });
    // Reproduce the reported flow: do not pre-save a ready status before pickup.
    await card.getByLabel("Estado del reingreso", { exact: true }).selectOption("en_reparacion");
    await card.getByRole("button", { name: "Guardar reingreso", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("fieldset[disabled]"));
    await page.waitForTimeout(300);
    assert.equal((await db.query("select status from public.repair_warranty_returns where order_id=$1", [order])).rows[0].status, "en_reparacion");
    await card.getByLabel("Estado del reingreso", { exact: true }).selectOption("retirado");
    await card.getByLabel("Resolucion del reingreso", { exact: true }).fill("Se reparo la retroiluminacion y se probo el equipo");
    await card.getByLabel("Quien retira", { exact: true }).fill("Cliente sintetico");
    await card.getByLabel("Confirmo la devolucion del equipo de este reingreso.", { exact: true }).check();
    await card.getByRole("button", { name: "Registrar retiro de garantia", exact: true }).click();
    await card.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Historial de retirados", exact: true }).click();
    await page.getByRole("heading", { name: "Reingreso por garantia retirado", exact: true }).waitFor();
    assert.deepEqual((await db.query("select to_jsonb(o) data from public.repair_access_orders o where id=$1", [order])).rows[0].data, original);

    await page.goto(base + `/reparaciones-access?view=ordenes&order=${noFault}`, { waitUntil: "networkidle" });
    const nfCard = page.locator("article").filter({ hasText: "BROWSER-WARRANTY original issue" }).filter({ hasNotText: "Reingreso por garantia" }).first();
    await nfCard.getByText("Actualizar trabajo", { exact: true }).click();
    await nfCard.getByRole("combobox", { name: /^Estado de la orden/ }).selectOption("no_presenta_fallas");
    await nfCard.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await nfCard.getByText("Cambios guardados en esta orden.", { exact: true }).waitFor();
    assert.equal((await db.query("select status from public.repair_access_orders where id=$1", [noFault])).rows[0].status, "no_presenta_fallas");
    // This separate baseline flow starts a second action from a fresh order snapshot.
    await page.reload({ waitUntil: "networkidle" });
    await nfCard.getByText("Actualizar trabajo", { exact: true }).click();
    await nfCard.getByRole("combobox", { name: /^Estado de la orden/ }).selectOption("retirado");
    await nfCard.getByLabel("Confirmo que el cliente retiro el equipo", { exact: true }).check();
    await nfCard.getByRole("button", { name: "Registrar retiro", exact: true }).click();
    await page.waitForTimeout(1000);
    assert.equal((await db.query("select status from public.repair_access_orders where id=$1", [noFault])).rows[0].status, "retirado");
    for (const width of [360, 390, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `root overflow ${width}`);
    }
    await page.goto(base + `/reparaciones-access?view=detalle&order=${order}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${output}/warranty-desktop.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS real mobile UI: same-order warranty intake, no-fault progress, warranty pickup/history, original row unchanged, no-fault unquoted order pickup, responsive widths and no runtime errors");
  } catch (e) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(await page.locator("main").innerText().catch(() => "No main")); throw e;
  } finally {
    await browser.close();
    await db.query("begin");
    try {
      const ids = (await db.query("select id::text from public.repair_warranty_returns where order_id=$1", [order])).rows.map((r) => r.id);
      await db.query("delete from private.workshop_warranty_receipts where request_fingerprint->>'order'=$1 or request_fingerprint->>'return'=any($2::text[])", [order, ids]);
      await db.query("delete from public.audit_logs where (entity_type='repair_warranty_returns' and entity_id=any($1::text[])) or (entity_type='repair_access_orders' and entity_id=any($2::text[]))", [ids, [order, noFault]]);
      await db.query("delete from public.repair_warranty_returns where order_id=$1", [order]);
      await db.query("delete from private.workshop_quick_save_receipts where order_id=any($1::uuid[])", [[order, noFault]]);
      for (const table of ["repair_customer_decisions", "workshop_tasks", "workshop_events", "repair_budget_versions"]) await db.query(`delete from public.${table} where order_id=any($1::uuid[])`, [[order, noFault]]);
      await db.query("delete from public.repair_access_orders where id=any($1::uuid[])", [[order, noFault]]);
      await db.query("delete from public.repair_access_devices where id=$1", [device]);
      await db.query("delete from public.repair_access_customers where id=$1", [customer]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; }
    finally { await db.end(); }
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
