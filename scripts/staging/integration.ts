import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IDENTITIES, LOCAL } from "./config";
import { connectDatabase } from "./db";
import { FIXTURES } from "./seed";
import { login, request, rpc, success } from "./client";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--require-financial")) throw new Error("Usage: integration.ts [--require-financial]");
  const db = await connectDatabase();
  const tag = `${LOCAL.fixtureTag}-HTTP-${randomUUID()}`;
  const admin = await login(), tech = await login("tecnico");
  try {
    await db.query("notify pgrst, 'reload schema'");
    const functions = await db.query("select proname from pg_proc where pronamespace='public'::regnamespace");
    const available = new Set(functions.rows.map((row) => row.proname));
    const product = randomUUID();
    await success("/rest/v1/products", admin, "POST", { id: product, sku: `STG-${product}`, name: tag,
      cost: 1000, sale_price: 2500, stock: 10, notes: tag });
    const stock = async () => (await success(`/rest/v1/products?id=eq.${product}&select=stock`, admin))[0].stock;
    const saleInput = { p_sale_id: null, p_sold_at: new Date().toISOString(), p_items: [{ productId: product, quantity: 2, unitPrice: 2500 }],
      p_payments: [{ method: "efectivo", amount: 5000 }], p_notes: tag };
    const deniedSale = await request("/rest/v1/rpc/save_sale_atomic", tech, "POST", saleInput);
    assert.ok(!deniedSale.response.ok, "Technician must not create a sale");
    assert.equal(await stock(), 10);
    const sale = await rpc("save_sale_atomic", admin, saleInput);
    assert.ok(sale.id);
    assert.equal(await stock(), 8);
    const items = await success(`/rest/v1/sale_items?sale_id=eq.${sale.id}&select=quantity,total`, admin);
    assert.equal(items.length, 1); assert.equal(items[0].quantity, 2); assert.equal(Number(items[0].total), 5000);
    const payments = await success(`/rest/v1/sale_payments?sale_id=eq.${sale.id}&select=amount`, admin);
    assert.equal(Number(payments[0].amount), 5000);
    const cash = await success(`/rest/v1/movimientos_caja?referencia_tabla=eq.sales&referencia_id=eq.${sale.id}&select=monto`, admin);
    assert.equal(Number(cash[0].monto), 5000);
    const failedUpdate = await request("/rest/v1/rpc/save_sale_atomic", admin, "POST", { ...saleInput, p_sale_id: sale.id, p_payments: [{ method: "efectivo", amount: 1 }] });
    assert.ok(!failedUpdate.response.ok);
    assert.equal(await stock(), 8, "Failed edit must roll back restored stock");
    assert.deepEqual(await success(`/rest/v1/sale_items?sale_id=eq.${sale.id}&select=quantity,total`, admin), items);
    console.log("PASS atomic sale: real RLS denial, stock, items, payment, cash projection, failed-edit rollback");

    const order = randomUUID();
    await success("/rest/v1/repair_access_orders", admin, "POST", { id: order, customer_id: FIXTURES.customer, device_id: FIXTURES.device,
      issue_reported: tag, notes: tag, status: "presupuestado", budget_amount: 100000, budget_detail: "Fuente sintetica",
      technician_id: IDENTITIES[1].id, created_by: IDENTITIES[0].id });
    const orderRow = async () => (await success(`/rest/v1/repair_access_orders?id=eq.${order}&select=workflow_version,approved_amount,status`, admin))[0];
    const version = (await orderRow()).workflow_version;
    const decision = { p_order_id: order, p_expected_version: version, p_operation_id: randomUUID(), p_decision: "accepted", p_channel: "telefono", p_notes: tag };
    assert.equal((await request("/rest/v1/rpc/workshop_decide", tech, "POST", decision)).response.status, 403);
    await rpc("workshop_decide", admin, decision);
    await rpc("workshop_decide", admin, decision);
    assert.equal(Number((await orderRow()).approved_amount), 100000);
    const decisions = await success(`/rest/v1/repair_customer_decisions?order_id=eq.${order}&select=id`, admin);
    assert.equal(decisions.length, 1, "Decision operation replay must be idempotent");
    const conflict = await request("/rest/v1/rpc/workshop_save", admin, "POST", { p_order_id: order, p_expected_version: version, p_payload: { repair_progress: "stale" } });
    assert.ok(!conflict.response.ok);
    assert.equal(conflict.data.code, "40001", "Preserve PostgreSQL serialization-failure contract (PostgREST maps it to HTTP 500)");
    const partInput = { p_order_id: order, p_operation_id: randomUUID(), p_description: tag, p_quantity: 2, p_priority: "alta", p_notes: tag, p_product_id: null };
    const part = await rpc("workshop_request_part", tech, partInput);
    assert.ok(part.id);
    const partParams = { p_id: part.id, p_expected_version: 1, p_action: "order", p_quantity: 0, p_supplier: "STAGING supplier", p_unit_cost: 15000,
      p_expected_date: new Date().toISOString().slice(0, 10), p_notes: tag };
    assert.equal((await request("/rest/v1/rpc/workshop_manage_part", tech, "POST", partParams)).response.status, 403);
    await rpc("workshop_manage_part", admin, partParams);
    await rpc("workshop_manage_part", admin, { ...partParams, p_expected_version: 2, p_action: "receive", p_quantity: 1 });
    const partRow = async () => (await success(`/rest/v1/repair_part_requests?id=eq.${part.id}&select=received_quantity,unit_cost,version`, admin))[0];
    assert.equal((await partRow()).received_quantity, 1);
    const excessive = await request("/rest/v1/rpc/workshop_manage_part", admin, "POST", { ...partParams, p_expected_version: 3, p_action: "receive", p_quantity: 2 });
    assert.ok(!excessive.response.ok);
    assert.equal((await partRow()).received_quantity, 1);
    const hidden = await success(`/rest/v1/repair_part_requests?id=eq.${part.id}&select=id`, tech);
    assert.deepEqual(hidden, []);
    const context = await rpc("get_workshop_context", tech, { p_order_ids: [order] });
    assert.ok(context[0].parts.length > 0); assert.equal(context[0].parts[0].unitCost, null);
    const page = await rpc("workshop_read_page", admin, { p_search: tag, p_status: "todos", p_warranty: "todos", p_scope: "all", p_cursor_date: null, p_cursor_id: null, p_limit: 25 });
    assert.equal(page.total, 1);
    console.log("PASS workshop: authorization, decision replay, stale-write conflict, technician part request, partial receipt, excess rollback, cost redaction, read page");

    if (available.has("get_workshop_product_availability")) {
      const availability = await rpc("get_workshop_product_availability", admin, { p_product_ids: [product] });
      assert.ok(availability);
      console.log("PASS available-SKU RPC:", JSON.stringify(availability));
    }
    const financial = ["save_invoice_atomic", "get_invoice_document", "save_repair_financial_atomic", "add_repair_payment_atomic", "reverse_repair_payment_atomic"];
    const missing = financial.filter((name) => !available.has(name));
    if (missing.length) {
      console.log("SKIP financial contracts not yet applied:", missing.join(", "));
      if (args.includes("--require-financial")) throw new Error("Required financial contracts unavailable");
    } else {
      const repair = await rpc("save_repair_financial_atomic", admin, { p_input: { requestId: randomUUID(), customerName: tag, device: "TV sintetico",
        repairAccessOrderId: order, amount: 100000, entryDate: new Date().toISOString().slice(0, 10), paymentDate: new Date().toISOString().slice(0, 10),
        payments: [{ method: "nx", amount: 30000 }], notes: tag } });
      const invoiceInput = { p_input: { requestId: randomUUID(), customerName: tag, sourceType: "repair", repairId: repair.id, notes: tag,
        items: [{ description: "Reparacion sintetica", quantity: 1, unitPrice: 100000 }] } };
      const invoice = await rpc("save_invoice_atomic", admin, invoiceInput);
      assert.equal(Number(invoice.paidTotal), 30000); assert.equal(Number(invoice.balance), 70000);
      assert.deepEqual(await rpc("save_invoice_atomic", admin, invoiceInput), invoice);
      assert.equal((await request("/rest/v1/rpc/save_invoice_atomic", tech, "POST", { p_input: { ...invoiceInput.p_input, requestId: randomUUID() } })).response.status, 403);
      await rpc("add_repair_payment_atomic", admin, { p_input: { requestId: randomUUID(), repairId: repair.id,
        paymentDate: new Date().toISOString().slice(0, 10), payments: [{ method: "mp", amount: 70000 }] } });
      const document = await rpc("get_invoice_document", admin, { p_invoice_id: invoice.id });
      assert.equal(Number(document.balance), 0);
      const paymentRows = await success(`/rest/v1/repair_payments?repair_id=eq.${repair.id}&method=eq.mp&select=id`, admin);
      const custodyBefore = await orderRow();
      await rpc("reverse_repair_payment_atomic", admin, { p_repair_id: repair.id, p_payment_id: paymentRows[0].id, p_reason: tag });
      assert.equal(Number((await rpc("get_invoice_document", admin, { p_invoice_id: invoice.id })).balance), 70000);
      assert.equal((await orderRow()).status, custodyBefore.status);
      console.log("PASS financial: atomic invoice, replay, technician denial, partial/full collection, reversal and unchanged custody");
    }
    console.log("Retained only additive synthetic run fixtures:", tag);
  } finally {
    await request("/auth/v1/logout?scope=local", admin, "POST");
    await request("/auth/v1/logout?scope=local", tech, "POST");
    await db.end();
  }
}

void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
