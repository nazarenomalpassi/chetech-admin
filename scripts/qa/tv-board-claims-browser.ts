import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { connectDatabase } from "../staging/db";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = "http://127.0.0.1:3001";
const output = "tmp/qa/tv-board-claims-20261020";

async function main() {
  const health = await fetch("http://127.0.0.1:54341/health").then(r => r.json());
  assert.equal(health.staging, true); assert.equal(health.database, "chetech_staging");
  const db = await connectDatabase();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(90000);
  const prefix = `CLAIM-UI-${randomUUID().slice(0, 8)}`;
  const a = randomUUID(), b = randomUUID(), c = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await mkdir(output, { recursive: true });
  const cashSql = "select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.movimientos_caja t";
  try {
    const cashBefore = (await db.query(cashSql)).rows[0].hash;
    for (const [id, model, amount] of [[a, "Restaurar", 104000.25], [b, "Anular", 50000.33], [c, "Conflicto", 25000.25]]) {
      await db.query("insert into public.tv_boards(id,brand,model,board_type,listed_price,is_active,sold_at,mercado_libre_net_amount,release_date,acquisition_cost,sale_notes) values($1,$2,$3,'main',500000,false,now(),$4,current_date-3,10000,'Original browser sale')", [id, prefix, model, amount]);
    }
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill("admin@staging.invalid");
    await page.getByLabel("Contraseña", { exact: true }).fill("Chetech-staging-only-20261005!");
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 90000 });
    const url = base + `/placas-tv?search=${prefix}&status=pending_release`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Placas de televisores", exact: true }).waitFor();
    const cardA = page.locator("article").filter({ hasText: `${prefix} Restaurar` });
    await cardA.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Iniciar reclamo", exact: true });
    await dialog.getByLabel("Notas del reclamo (opcional)", { exact: true }).fill("Llego danada. Reclamo registrado en ML.");
    await dialog.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const queue = page.getByRole("region", { name: "Reclamos / dinero retenido", exact: true });
    await queue.getByText(`${prefix} Restaurar`, { exact: true }).waitFor();
    assert.equal(await cardA.count(), 0, "held sale must leave pending inventory results");
    assert.equal((await db.query("select claim_status,released_at from public.tv_boards where id=$1", [a])).rows[0].claim_status, "open");
    const heldMetric = page.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Dinero retenido$/ }) });
    assert.match(await heldMetric.innerText(), /104\.000,25/);
    await page.screenshot({ path: `${output}/held-mobile.png`, fullPage: true });

    await queue.locator("li").filter({ hasText: `${prefix} Restaurar` }).getByRole("button", { name: "Resolver reclamo", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Resolver reclamo", exact: true });
    await dialog.getByLabel("Notas de resolucion (opcional)", { exact: true }).fill("Contrarreclamo favorable");
    await dialog.getByRole("button", { name: "Volver a pendiente", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await cardA.getByRole("button", { name: "Confirmar liberacion", exact: true }).waitFor();
    assert.equal((await db.query("select released_at from public.tv_boards where id=$1", [a])).rows[0].released_at, null);
    page.once("dialog", async (d: any) => d.accept());
    await cardA.getByRole("button", { name: "Confirmar liberacion", exact: true }).click();
    await cardA.waitFor({ state: "hidden" });
    assert.ok((await db.query("select released_at from public.tv_boards where id=$1", [a])).rows[0].released_at);

    await page.setViewportSize({ width: 1366, height: 900 });
    const rowB = page.getByRole("row").filter({ hasText: `${prefix} Anular` });
    await rowB.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Iniciar reclamo", exact: true });
    await dialog.getByLabel("Notas del reclamo (opcional)", { exact: true }).fill("Cliente compro otra placa");
    await dialog.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await queue.locator("li").filter({ hasText: `${prefix} Anular` }).getByRole("button", { name: "Resolver reclamo", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Resolver reclamo", exact: true });
    await dialog.getByLabel("Resolucion", { exact: true }).selectOption("cancel_sale");
    await dialog.getByLabel("Notas de resolucion (opcional)", { exact: true }).fill("Devolucion confirmada, venta anulada");
    await dialog.getByRole("button", { name: "Anular venta", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByLabel("Notas de resolucion (opcional)", { exact: true }).inputValue(), "Devolucion confirmada, venta anulada");
    await dialog.getByLabel("Confirmo anular esta venta sin reponer stock", { exact: true }).check();
    await dialog.getByRole("button", { name: "Anular venta", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("combobox", { name: "Filtrar placas por estado", exact: true }).selectOption("cancelled");
    await page.waitForURL("**status=cancelled*");
    await rowB.locator("span").filter({ hasText: /^Venta anulada$/ }).waitFor();
    assert.equal(await rowB.getByRole("button", { name: "Confirmar liberacion", exact: true }).count(), 0);
    assert.equal(await rowB.getByRole("button", { name: "Registrar venta", exact: true }).count(), 0);
    await rowB.getByText(/^Ver historial \(/).click();
    await page.screenshot({ path: `${output}/cancelled-desktop.png`, fullPage: true });
    const cancelled = (await db.query("select claim_status,sold_at,mercado_libre_net_amount,is_active,released_at from public.tv_boards where id=$1", [b])).rows[0];
    assert.equal(cancelled.claim_status, "cancelled"); assert.equal(cancelled.is_active, false);
    assert.equal(Number(cancelled.mercado_libre_net_amount), 50000.33); assert.ok(cancelled.sold_at); assert.equal(cancelled.released_at, null);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: "networkidle" });
    const cardC = page.locator("article").filter({ hasText: `${prefix} Conflicto` });
    await cardC.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Iniciar reclamo", exact: true });
    await dialog.getByLabel("Notas del reclamo (opcional)", { exact: true }).fill("Conservar esta nota despues del conflicto");
    await db.query("update public.tv_boards set model=model where id=$1", [c]);
    let releaseRequest: (() => void) | undefined;
    const heldRequest = new Promise<void>(resolve => { releaseRequest = resolve; });
    let blockNext = true;
    await page.route("**/placas-tv?**", async (route: any) => {
      if (blockNext && route.request().method() === "POST") { blockNext = false; await heldRequest; }
      await route.continue();
    });
    try {
      await dialog.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
      await dialog.getByRole("button", { name: "Guardando...", exact: true }).waitFor();
      await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
      assert.ok(await dialog.evaluate((node: HTMLElement) => node.contains(document.activeElement)), "keyboard focus escaped the pending modal");
    } finally { releaseRequest?.(); }
    await dialog.getByRole("button", { name: "Actualizar estado sin perder notas", exact: true }).click();
    await dialog.getByRole("button", { name: "Iniciar reclamo", exact: true }).waitFor({ state: "visible" });
    assert.equal(await dialog.getByLabel("Notas del reclamo (opcional)", { exact: true }).inputValue(), "Conservar esta nota despues del conflicto");
    await dialog.getByRole("button", { name: "Iniciar reclamo", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal((await db.query("select claim_notes from public.tv_boards where id=$1", [c])).rows[0].claim_notes, "Conservar esta nota despues del conflicto");
    await queue.locator("li").filter({ hasText: `${prefix} Conflicto` }).getByRole("button", { name: "Resolver reclamo", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Resolver reclamo", exact: true });
    await dialog.getByLabel("Resolucion", { exact: true }).selectOption("cancel_sale");
    await dialog.getByLabel("Confirmo anular esta venta sin reponer stock", { exact: true }).check();
    await dialog.getByRole("button", { name: "Anular venta", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });

    for (const width of [360, 390, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `root overflow at ${width}`);
    }
    await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "MP retenido por reclamos", exact: true }).waitFor();
    assert.equal((await db.query(cashSql)).rows[0].hash, cashBefore);
    assert.deepEqual(errors, []);
    console.log("PASS authenticated mobile/desktop UI: claim, held KPI/global queue, resume without release, confirmed release, cancel with confirmation/draft preservation, cancelled filter/history, stale recovery preserving notes, pending keyboard focus, no cash mutations or runtime errors");
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.error(await page.locator("main").innerText().catch(() => "No main")); throw error;
  } finally { await browser.close(); await db.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
