import { createServerSupabaseClient } from "@/lib/supabase/server";

function readRelated(record: any) {
  return Array.isArray(record) ? record[0] : record;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function buildSaleItemDescription(item: any) {
  const product = readRelated(item.products);
  const name = cleanText(product?.name) || "Producto vendido";
  const sku = cleanText(product?.sku);
  return sku ? `${name} (${sku})` : name;
}

function buildRepairItemDescription(repair: any) {
  const accessOrder = readRelated(repair.repair_access_orders);
  const repairNumber = cleanText(accessOrder?.repair_number ?? repair.order_number);
  const device = cleanText(repair.device) || "equipo";
  const issue = cleanText(repair.issue_description);
  const prefix = repairNumber ? `Servicio tecnico ${repairNumber}` : "Servicio tecnico";

  return issue ? `${prefix} - ${device}. Detalle: ${issue}` : `${prefix} - ${device}`;
}

function isGenericSaleInvoiceItem(items: Array<{ description: string }>) {
  if (items.length !== 1) return false;
  const description = cleanText(items[0]?.description).toLowerCase();
  return description === "articulo" || description.startsWith("venta ");
}

async function getSaleItemsForInvoices(supabase: any, saleIds: string[]) {
  if (!saleIds.length) return new Map<string, any[]>();

  const { data, error } = await supabase
    .from("sale_items")
    .select("id, sale_id, product_id, quantity, unit_price, total, products(name, sku)")
    .in("sale_id", saleIds)
    .order("id");

  if (error) throw new Error(error.message);

  const grouped = new Map<string, any[]>();
  for (const item of data ?? []) {
    const current = grouped.get(item.sale_id) ?? [];
    current.push({
      id: item.id,
      description: buildSaleItemDescription(item),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      total: Number(item.total),
      productId: item.product_id
    });
    grouped.set(item.sale_id, current);
  }

  return grouped;
}

export async function getInvoices() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("invoices")
    .select("id, invoice_number, customer_name, customer_phone, source_type, total, paid_total, balance, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []).map((invoice: any) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone ?? "",
    sourceType: invoice.source_type,
    total: Number(invoice.total),
    status: invoice.status,
    createdAt: invoice.created_at
  }));
}

export async function getInvoiceById(id: string) {
  const supabase = await createServerSupabaseClient();
  const [invoiceResult, itemsResult] = await Promise.all([
    (supabase as any)
      .from("invoices")
      .select(
        "id, invoice_number, customer_name, customer_phone, source_type, repair_id, sale_id, subtotal, discount, total, paid_total, balance, status, notes, created_at"
      )
      .eq("id", id)
      .single(),
    (supabase as any)
      .from("invoice_items")
      .select("id, description, quantity, unit_price, total")
      .eq("invoice_id", id)
      .order("id")
  ]);

  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const invoice = invoiceResult.data;
  let mappedItems = (itemsResult.data ?? []).map((item: any) => ({
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    total: Number(item.total)
  }));

  if (invoice.source_type === "sale" && invoice.sale_id && isGenericSaleInvoiceItem(mappedItems)) {
    const saleItemsBySale = await getSaleItemsForInvoices(supabase as any, [invoice.sale_id]);
    const saleItems = saleItemsBySale.get(invoice.sale_id) ?? [];
    if (saleItems.length) mappedItems = saleItems;
  }

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone ?? "",
    sourceType: invoice.source_type,
    repairId: invoice.repair_id,
    saleId: invoice.sale_id,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    total: Number(invoice.total),
    paidTotal: Number(invoice.paid_total),
    balance: Number(invoice.balance),
    status: invoice.status,
    notes: invoice.notes ?? "",
    createdAt: invoice.created_at,
    items: mappedItems
  };
}

export async function getInvoiceFormOptions() {
  const supabase = await createServerSupabaseClient();
  const [repairsResult, salesResult, productsResult] = await Promise.all([
    (supabase as any)
      .from("repairs")
      .select("id, customer_name, customer_phone, device, order_number, issue_description, final_price, estimated_price, observations, status, repair_access_orders(repair_number)")
      .order("created_at", { ascending: false })
      .limit(150),
    (supabase as any)
      .from("sales")
      .select("id, sale_number, subtotal, notes, sold_at, cliente_id, clientes(nombre, telefono)")
      .order("sold_at", { ascending: false })
      .limit(150),
    (supabase as any)
      .from("products")
      .select("id, sku, name, sale_price")
      .eq("is_active", true)
      .order("name")
      .limit(300)
  ]);

  if (repairsResult.error) throw new Error(repairsResult.error.message);
  if (salesResult.error) throw new Error(salesResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);

  const saleIds = (salesResult.data ?? []).map((sale: any) => sale.id);
  const saleItemsBySale = await getSaleItemsForInvoices(supabase as any, saleIds);

  return {
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
      const saleItems = saleItemsBySale.get(sale.id) ?? [];

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
