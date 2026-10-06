import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { formatCashMethod } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createOperationalExport, readExportTable } from "./operational-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const MAX_HTTP_JSON_BYTES = 4 * 1024 * 1024;

const excelTables = [
  { table: "products", sheet: "Productos", columns: "sku, name, cost, sale_price, stock, min_stock, is_active, created_at" },
  { table: "sales", sheet: "Ventas", columns: "id, sale_number, subtotal, cost_total, profit_total, sold_at, notes, created_at, updated_at" },
  { table: "sale_items", sheet: "Items venta", columns: "sale_id, product_id, quantity, unit_price, unit_cost, total" },
  { table: "expenses", sheet: "Gastos", columns: "id, expense_date, type, description, amount, payment_method, is_voided, observations, created_at, updated_at" },
  { table: "repairs", sheet: "Reparaciones", columns: "id, customer_name, customer_phone, device, order_number, final_price, status, entry_date, created_at, updated_at" },
  { table: "invoices", sheet: "Facturacion", columns: "invoice_number, customer_name, customer_phone, source_type, subtotal, discount, total, status, created_at" },
  { table: "movimientos_caja", sheet: "Caja", columns: "fecha, tipo, monto, medio_pago, descripcion" }
];

export async function GET(request: Request) {
  await requireAdmin();
  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  if (format !== "json" && format !== "xlsx") return NextResponse.json({ error: "Formato permitido: json o xlsx." }, { status: 400, headers: privateHeaders });
  const date = new Date().toISOString().slice(0, 10);
  try {
    if (format === "json") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return NextResponse.json({ error: "El export JSON completo requiere la credencial privada de servicio del servidor. Usa el CLI privado; no se genera un export parcial." }, { status: 503, headers: privateHeaders });
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const result = await createOperationalExport(supabase, { sourceRevision: process.env.VERCEL_GIT_COMMIT_SHA });
      const body = JSON.stringify(result);
      if (Buffer.byteLength(body, "utf8") > MAX_HTTP_JSON_BYTES) {
        return NextResponse.json({ error: "La exportacion JSON supera el limite HTTP de 4 MiB. Usa el CLI privado scripts/backup-export.ts con --env-path y --out-dir tmp/backups/application. No se entrega un archivo parcial ni truncado." }, { status: 413, headers: privateHeaders });
      }
      return new NextResponse(body, { headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="export-operativo-chetech-${date}.json"` } });
    }
    // Keep the existing writer isolated from JSON. Replacing vulnerable xlsx requires coordination.
    const XLSX = await import("xlsx");
    const supabase = await createServerSupabaseClient();
    const workbook = XLSX.utils.book_new();
    for (const spec of excelTables) {
      const rows = await readExportTable(supabase, { table: spec.table, module: "legacy-excel", identity: "id" }, 500, spec.columns);
      const formattedRows = rows.map(row => spec.table === "expenses" ? { ...row, payment_method: formatCashMethod(row.payment_method as string) } : spec.table === "movimientos_caja" ? { ...row, medio_pago: formatCashMethod(row.medio_pago as string) } : row);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(formattedRows.length ? formattedRows : [{ sin_datos: "Sin datos" }]), spec.sheet);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { alcance: "Exportacion operativa parcial de siete tablas. NO es un backup completo de PostgreSQL." },
      { alcance: "Sin auth, archivos Storage, esquema, politicas, funciones ni secuencias. Lectura no transaccional." },
      { alcance: "Para exportacion operativa amplia usar /api/backup?format=json; para recuperacion tecnica seguir docs/operations/backup-restore.md." }
    ]), "Alcance");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, { headers: { ...privateHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="backup-chetech-${date}.xlsx"` } });
  } catch {
    return NextResponse.json({ error: "No se pudo completar la exportacion. No se genero un respaldo parcial; reintenta en una ventana sin cambios o usa el CLI privado." }, { status: 500, headers: privateHeaders });
  }
}
