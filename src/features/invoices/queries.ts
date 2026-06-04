import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    (supabase as any).from("invoices").select("*").eq("id", id).single(),
    (supabase as any).from("invoice_items").select("*").eq("invoice_id", id).order("id")
  ]);

  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const invoice = invoiceResult.data;
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
    items: (itemsResult.data ?? []).map((item: any) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      total: Number(item.total)
    }))
  };
}

export async function getInvoiceFormOptions() {
  const supabase = await createServerSupabaseClient();
  const [repairsResult, salesResult, productsResult] = await Promise.all([
    (supabase as any)
      .from("repairs")
      .select("id, customer_name, customer_phone, device, issue_description, final_price, estimated_price, observations, status")
      .order("created_at", { ascending: false })
      .limit(150),
    (supabase as any)
      .from("sales")
      .select("id, sale_number, subtotal, notes, sold_at")
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
      status: repair.status
    })),
    sales: (salesResult.data ?? []).map((sale: any) => ({
      id: sale.id,
      label: `${sale.sale_number} - ${Number(sale.subtotal).toLocaleString("es-AR")}`,
      saleNumber: sale.sale_number,
      amount: Number(sale.subtotal),
      notes: sale.notes ?? ""
    })),
    products: (productsResult.data ?? []).map((product: any) => ({
      id: product.id,
      label: `${product.sku} - ${product.name}`,
      name: product.name,
      price: Number(product.sale_price)
    }))
  };
}
