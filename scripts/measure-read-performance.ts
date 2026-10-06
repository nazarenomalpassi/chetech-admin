import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { performance } from "node:perf_hooks";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type Measurement = {
  label: string;
  milliseconds: number;
  rows: number;
  bytes: number;
  error: string | null;
};

async function measure(
  label: string,
  operation: () => PromiseLike<{ data: unknown; error: { message: string } | null }>
) {
  const startedAt = performance.now();
  const result = await operation();
  const milliseconds = performance.now() - startedAt;
  const rows = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  const bytes = Buffer.byteLength(JSON.stringify(result.data ?? null));

  return {
    label,
    milliseconds: Math.round(milliseconds),
    rows,
    bytes,
    error: result.error?.message ?? null
  } satisfies Measurement;
}

async function main() {
  const measurements = await Promise.all([
    measure("repair_orders_current_150", () =>
      supabase
        .from("repair_access_orders")
        .select("id,repair_number,intake_date,issue_reported,technical_diagnosis,repair_progress,budget_amount,budget_detail,budget_response_notes,budget_response_at,approved_amount,final_amount,payment_method,payment_notes,is_paid,paid_at,delivered_at,warranty_start,warranty_until,warranty_days,warranty_conditions,warranty_active,work_performed,used_parts,internal_observations,technician_name,notes,priority,status,created_at,repair_access_customers(id,full_name,phone,alternate_phone,phone_normalized,dni,email,address,notes),repair_access_devices(id,device_type,brand,model,serial_number,accessory_details,visual_condition,notes)")
        .order("created_at", { ascending: false })
        .limit(150)
    ),
    measure("repair_orders_optimized_100", () =>
      supabase
        .from("repair_access_orders")
        .select("id,repair_number,intake_date,issue_reported,technical_diagnosis,repair_progress,budget_amount,budget_detail,budget_response_notes,budget_response_at,approved_amount,final_amount,payment_method,payment_notes,is_paid,paid_at,delivered_at,warranty_start,warranty_until,warranty_days,warranty_conditions,warranty_active,work_performed,used_parts,internal_observations,technician_name,notes,priority,status,created_at,repair_access_customers(id,full_name,phone,alternate_phone,phone_normalized,dni,email,address,notes),repair_access_devices(id,device_type,brand,model,serial_number,accessory_details,visual_condition,notes)")
        .order("created_at", { ascending: false })
        .limit(100)
    ),
    measure("repair_customers_current_500", () =>
      supabase
        .from("repair_access_customers")
        .select("id,full_name,phone,alternate_phone,dni,email,address,notes,source,created_at")
        .order("full_name", { ascending: true })
        .limit(500)
    ),
    measure("repair_customers_optimized_40", () =>
      supabase
        .from("repair_access_customers")
        .select("id,full_name,phone,alternate_phone,dni,email,address,notes,source,created_at")
        .order("created_at", { ascending: false })
        .limit(40)
    ),
    measure("products_category_refs_current", () =>
      supabase.from("products").select("category_id")
    ),
    measure("products_category_counts_optimized", () =>
      supabase.rpc("get_product_category_counts")
    ),
    measure("cash_movements_current", () =>
      supabase
        .from("movimientos_caja")
        .select("tipo,monto,medio_pago,fecha")
        .gte("fecha", "2026-04-16T14:21:01.222Z")
    ),
    measure("cash_summary_optimized", () =>
      supabase.rpc("get_dashboard_cash_summary", {
        p_cutoff: null,
        p_start: "2026-07-13T03:00:00.000Z",
        p_end: "2026-07-14T03:00:00.000Z"
      })
    )
  ]);

  process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
