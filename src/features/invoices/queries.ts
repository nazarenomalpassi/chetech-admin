import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyStableCreationOrder } from "@/lib/chronology";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";
import { mapInvoiceSaleItems } from "@/features/invoices/sale-item-mapper";
import { mapPrimaryOrderOption } from "./primary-order-mapper";

function readRelated(record: any) {
  return Array.isArray(record) ? record[0] : record;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function buildRepairItemDescription(repair: any) {
  const accessOrder = readRelated(repair.repair_access_orders);
  const repairNumber = cleanText(accessOrder?.repair_number ?? repair.order_number);
  const device = cleanText(repair.device) || "equipo";
  const issue = cleanText(repair.issue_description);
  const prefix = repairNumber ? `Servicio tecnico ${repairNumber}` : "Servicio tecnico";

  return issue ? `${prefix} - ${device}. Detalle: ${issue}` : `${prefix} - ${device}`;
}

export async function getInvoices(page = 1) {
  const supabase = await createServerSupabaseClient();
  const { from, to } = getPaginationRange(page);
  const { data, error, count } = await (supabase as any)
    .from("invoices")
    .select("id, invoice_number, customer_name, customer_phone, source_type, total, paid_total, balance, status, document_version, fiscal_reference, fiscal_locked_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const settlements = data?.length ? await (supabase as any).rpc("get_invoice_settlements", { p_invoice_ids: data.map((invoice: any) => invoice.id) }) : { data: [], error: null };
  if (settlements.error) throw new Error(settlements.error.message);
  const byId = new Map<string, any>((settlements.data ?? []).map((settlement: any) => [settlement.invoice_id, settlement]));
  const items = (data ?? []).map((row: any) => {
    const invoice = { ...row, ...byId.get(row.id)?.header };
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_name,
      customerPhone: invoice.customer_phone ?? "",
      sourceType: invoice.source_type,
      total: Number(invoice.total),
      paidTotal: Number(byId.get(invoice.id)?.paid_total ?? invoice.paid_total),
      balance: Number(byId.get(invoice.id)?.balance ?? invoice.balance),
      status: byId.get(invoice.id)?.status ?? invoice.status,
      documentVersion: Number(invoice.document_version),
      fiscalReference: invoice.fiscal_reference ?? null,
      fiscalLockedAt: invoice.fiscal_locked_at ?? null,
      createdAt: invoice.created_at
    };
  });

  return {
    items,
    pagination: createPaginationMeta(count ?? items.length, page, DEFAULT_PAGE_SIZE)
  };
}

export async function getInvoiceById(id: string) {
  const supabase = await createServerSupabaseClient();
  // One read-only statement yields a consistent document and current linked collections.
  const { data: invoice, error } = await (supabase as any).rpc("get_invoice_document", { p_invoice_id: id });
  if (error || !invoice) throw new Error(error?.message ?? "No se encontro el comprobante.");
  const mappedItems = (invoice.items ?? []).map((item: any) => ({
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    total: Number(item.total),
    productId: item.product_id ?? null,
    repairId: item.repair_id ?? null
  }));

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone ?? "",
    sourceType: invoice.source_type,
    repairId: invoice.repair_id,
    repairAccessOrderId: invoice.repair_access_order_id ?? null,
    saleId: invoice.sale_id,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    total: Number(invoice.total),
    paidTotal: Number(invoice.paid_total),
    balance: Number(invoice.balance),
    status: invoice.status,
    documentVersion: Number(invoice.document_version),
    fiscalProvider: invoice.fiscal_provider ?? null,
    fiscalReference: invoice.fiscal_reference ?? null,
    fiscalIssuedAt: invoice.fiscal_issued_at ?? null,
    fiscalLockedAt: invoice.fiscal_locked_at ?? null,
    notes: invoice.notes ?? "",
    createdAt: invoice.created_at,
    items: mappedItems,
    payments: (invoice.payments ?? []).map((payment: any) => ({ id: payment.id, source: payment.source, method: payment.method, amount: Number(payment.amount), paymentDate: payment.payment_date }))
  };
}

export async function getInvoiceFormOptions(selectedPrimaryOrderId?: string) {
  const supabase = await createServerSupabaseClient();
  const primarySelect = "id, repair_number, order_number, final_amount, approved_amount, budget_amount, issue_reported, work_performed, budget_detail, notes, created_at, repair_access_customers(full_name, phone), repair_access_devices(device_type, brand, model)";
  const [repairsResult, salesResult, productsResult, primaryResult, selectedPrimaryResult] = await Promise.all([
    applyStableCreationOrder(
      (supabase as any)
        .from("repairs")
        .select("id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, observations, status, created_at, repair_access_orders(repair_number)")
    )
      .limit(150),
    applyStableCreationOrder(
      (supabase as any)
        .from("sales")
        .select("id, sale_number, subtotal, notes, sold_at, created_at, cliente_id, clientes(nombre, telefono), sale_items(id, product_id, quantity, unit_price, total, products(name, sku))")
    )
      .limit(150),
    (supabase as any)
      .from("products")
      .select("id, sku, name, sale_price")
      .eq("is_active", true)
      .order("name")
      .limit(300),
    applyStableCreationOrder((supabase as any).from("repair_access_orders").select(primarySelect)).limit(150),
    selectedPrimaryOrderId ? (supabase as any).from("repair_access_orders").select(primarySelect).eq("id", selectedPrimaryOrderId).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);

  if (repairsResult.error) throw new Error(repairsResult.error.message);
  if (salesResult.error) throw new Error(salesResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  if (selectedPrimaryResult.error) throw new Error(selectedPrimaryResult.error.message);
  const primaryOrders = [...(primaryResult.data ?? [])];
  if (selectedPrimaryResult.data && !primaryOrders.some((order: any) => order.id === selectedPrimaryResult.data.id)) primaryOrders.unshift(selectedPrimaryResult.data);

  return {
    primaryOrders: primaryOrders.map(mapPrimaryOrderOption),
    repairs: (repairsResult.data ?? []).map((repair: any) => ({
      id: repair.id,
      label: `${repair.customer_name} - ${repair.device}`,
      customerName: repair.customer_name,
      customerPhone: repair.customer_phone ?? "",
      device: repair.device,
      issueDescription: repair.issue_description,
      amount: Number(repair.final_price ?? repair.estimated_price ?? 0),
      observations: repair.observations ?? "",
      status: repair.status,
      description: buildRepairItemDescription(repair)
    })),
    sales: (salesResult.data ?? []).map((sale: any) => {
      const customer = readRelated(sale.clientes);
      const saleItems = mapInvoiceSaleItems(sale.sale_items ?? []);

      return {
        id: sale.id,
        label: `${sale.sale_number} - ${Number(sale.subtotal).toLocaleString("es-AR")}`,
        saleNumber: sale.sale_number,
        amount: Number(sale.subtotal),
        notes: sale.notes ?? "",
        customerName: customer?.nombre ?? "",
        customerPhone: customer?.telefono ?? "",
        items: saleItems
      };
    }),
    products: (productsResult.data ?? []).map((product: any) => ({
      id: product.id,
      label: `${product.sku} - ${product.name}`,
      name: product.name,
      price: Number(product.sale_price)
    }))
  };
}
