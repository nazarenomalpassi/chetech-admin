import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/lib/auth";
import { formatCashMethod } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();

  const [products, sales, saleItems, expenses, repairs, invoices, cashMovements] = await Promise.all([
    (supabase as any).from("products").select("sku, name, cost, sale_price, stock, min_stock, is_active, created_at"),
    (supabase as any).from("sales").select("sale_number, subtotal, cost_total, profit_total, sold_at, notes"),
    (supabase as any).from("sale_items").select("sale_id, product_id, quantity, unit_price, unit_cost, total"),
    (supabase as any).from("expenses").select("expense_date, type, description, amount, payment_method, is_voided, observations"),
    (supabase as any).from("repairs").select("customer_name, customer_phone, device, order_number, final_price, status, created_at"),
    (supabase as any).from("invoices").select("invoice_number, customer_name, customer_phone, source_type, subtotal, discount, total, status, created_at"),
    (supabase as any).from("movimientos_caja").select("fecha, tipo, monto, medio_pago, descripcion")
  ]);

  const firstError = [products, sales, saleItems, expenses, repairs, invoices, cashMovements].find((result) => result.error)?.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const workbook = XLSX.utils.book_new();
  addSheet(workbook, "Productos", products.data ?? []);
  addSheet(workbook, "Ventas", sales.data ?? []);
  addSheet(workbook, "Items venta", saleItems.data ?? []);
  addSheet(
    workbook,
    "Gastos",
    (expenses.data ?? []).map((row: any) => ({
      ...row,
      payment_method: formatCashMethod(row.payment_method)
    }))
  );
  addSheet(workbook, "Reparaciones", repairs.data ?? []);
  addSheet(workbook, "Facturacion", invoices.data ?? []);
  addSheet(
    workbook,
    "Caja",
    (cashMovements.data ?? []).map((row: any) => ({
      ...row,
      medio_pago: formatCashMethod(row.medio_pago)
    }))
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="backup-chetech-${date}.xlsx"`
    }
  });
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ sin_datos: "Sin datos" }]);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
