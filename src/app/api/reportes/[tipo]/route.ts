import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { formatCashMethod } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ReportType = "ventas" | "gastos" | "caja" | "reparaciones" | "facturacion" | "sueldos";

const REPORT_TYPES: ReportType[] = ["ventas", "gastos", "caja", "reparaciones", "facturacion", "sueldos"];

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

export async function GET(request: Request, context: { params: Promise<{ tipo: string }> }) {
  await requireAdmin();
  const { tipo } = await context.params;
  const reportType = tipo as ReportType;

  if (!REPORT_TYPES.includes(reportType)) {
    return NextResponse.json({ error: "Reporte no soportado" }, { status: 400 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const supabase = await createServerSupabaseClient();

  if (reportType === "ventas") {
    let query = (supabase as any)
      .from("sales")
      .select("sale_number, subtotal, cost_total, profit_total, sold_at, created_by")
      .order("sold_at", { ascending: false });
    if (from) query = query.gte("sold_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("sold_at", `${to}T23:59:59.999Z`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      toCsv(
        ["numero", "fecha", "total", "costo", "ganancia", "creado_por"],
        (data ?? []).map((row: any) => [
          row.sale_number,
          row.sold_at,
          row.subtotal,
          row.cost_total,
          row.profit_total,
          row.created_by
        ])
      ),
      "reporte-ventas.csv"
    );
  }

  if (reportType === "reparaciones") {
    let query = (supabase as any)
      .from("repairs")
      .select("customer_name, device, order_number, final_price, estimated_price, created_at, created_by")
      .order("created_at", { ascending: false });
    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      toCsv(
        ["cliente", "equipo", "numero_orden", "monto_final", "monto_estimado", "fecha", "creado_por"],
        (data ?? []).map((row: any) => [
          row.customer_name,
          row.device,
          row.order_number,
          row.final_price,
          row.estimated_price,
          row.created_at,
          row.created_by
        ])
      ),
      "reporte-reparaciones.csv"
    );
  }

  if (reportType === "gastos") {
    let query = (supabase as any)
      .from("expenses")
      .select("expense_date, type, description, amount, payment_method, is_voided, observations")
      .order("expense_date", { ascending: false });
    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      toCsv(
        ["fecha", "tipo", "descripcion", "monto", "cuenta", "anulado", "observaciones"],
        (data ?? []).map((row: any) => [
          row.expense_date,
          row.type,
          row.description,
          row.amount,
          formatCashMethod(row.payment_method),
          row.is_voided,
          row.observations
        ])
      ),
      "reporte-gastos.csv"
    );
  }

  if (reportType === "facturacion") {
    let query = (supabase as any)
      .from("invoices")
      .select("invoice_number, customer_name, customer_phone, source_type, total, paid_total, balance, status, created_at")
      .order("created_at", { ascending: false });
    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      toCsv(
        ["numero", "fecha", "cliente", "telefono", "origen", "total", "pagado", "saldo", "estado"],
        (data ?? []).map((row: any) => [
          row.invoice_number,
          row.created_at,
          row.customer_name,
          row.customer_phone,
          row.source_type,
          row.total,
          row.paid_total,
          row.balance,
          row.status
        ])
      ),
      "reporte-facturacion.csv"
    );
  }

  if (reportType === "sueldos") {
    let query = (supabase as any)
      .from("salary_withdrawals")
      .select("withdrawal_date, amount, payment_method, notes, created_at")
      .order("withdrawal_date", { ascending: false });
    if (from) query = query.gte("withdrawal_date", from);
    if (to) query = query.lte("withdrawal_date", to);
    const { data, error } = await query;

    if (error?.code === "42P01") {
      return csvResponse(toCsv(["fecha", "monto", "cuenta", "observaciones", "creado_en"], []), "reporte-sueldos.csv");
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return csvResponse(
      toCsv(
        ["fecha", "monto", "cuenta", "observaciones", "creado_en"],
        (data ?? []).map((row: any) => [
          row.withdrawal_date,
          row.amount,
          formatCashMethod(row.payment_method, { context: "salary" }),
          row.notes,
          row.created_at
        ])
      ),
      "reporte-sueldos.csv"
    );
  }

  let query = (supabase as any)
    .from("movimientos_caja")
    .select("fecha, tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id")
    .order("fecha", { ascending: false });
  if (from) query = query.gte("fecha", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("fecha", `${to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return csvResponse(
    toCsv(
      ["fecha", "tipo", "monto", "cuenta", "descripcion", "tabla", "referencia"],
      (data ?? []).map((row: any) => [
        row.fecha,
        row.tipo,
        row.monto,
        formatCashMethod(row.medio_pago),
        row.descripcion,
        row.referencia_tabla,
        row.referencia_id
      ])
    ),
    "reporte-caja.csv"
  );
}
