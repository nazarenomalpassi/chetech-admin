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

type QueryResult = { data: unknown; error: { message: string } | null };
type Measurement = {
  label: string;
  milliseconds: number;
  requests: number;
  bytes: number;
  error: string | null;
};

async function measure(label: string, requests: number, operation: () => PromiseLike<QueryResult>) {
  const startedAt = performance.now();
  const result = await operation();
  const milliseconds = performance.now() - startedAt;

  return {
    label,
    milliseconds: Math.round(milliseconds),
    requests,
    bytes: Buffer.byteLength(JSON.stringify(result.data ?? null)),
    error: result.error?.message ?? null
  } satisfies Measurement;
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

async function periodQueries(startIso: string, endIso: string, dateStart: string, dateEnd: string) {
  return Promise.all([
    supabase.from("sales").select("subtotal,profit_total").gte("sold_at", startIso).lt("sold_at", endIso),
    supabase.from("repairs").select("final_price,estimated_price").gte("entry_date", dateStart).lt("entry_date", dateEnd),
    supabase.from("expenses").select("amount,is_voided").gte("expense_date", dateStart).lt("expense_date", dateEnd),
    supabase.from("invoices").select("total").neq("status", "anulado").gte("created_at", startIso).lt("created_at", endIso),
    supabase.from("movimientos_caja").select("tipo,monto").gte("fecha", startIso).lt("fecha", endIso),
    supabase.from("salary_withdrawals").select("amount").gte("withdrawal_date", dateStart).lt("withdrawal_date", dateEnd)
  ]) as Promise<Array<{ data: unknown; error: { message: string } | null }>>;
}

async function main() {
  await supabase.from("profiles").select("id", { head: true }).limit(1);

  const measurements: Measurement[] = [];
  measurements.push(
    await measure("sales_before_waterfall", 3, async () => {
      const sales = await supabase
        .from("sales")
        .select("id,sale_number,subtotal,cost_total,profit_total,sold_at,notes,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (sales.error) return sales;
      const ids = (sales.data ?? []).map((sale) => sale.id);
      const related = ids.length
        ? await Promise.all([
            supabase.from("sale_payments").select("sale_id,method,amount").in("sale_id", ids),
            supabase.from("sale_items").select("sale_id,product_id,quantity,unit_price,total,products(name,sku)").in("sale_id", ids)
          ])
        : [];
      return { data: { sales: sales.data, related: related.map((result) => result.data) }, error: firstError(related) };
    })
  );
  measurements.push(
    await measure("sales_after_relational", 1, () =>
      supabase
        .from("sales")
        .select("id,sale_number,subtotal,cost_total,profit_total,sold_at,notes,created_at,updated_at,sale_payments(method,amount),sale_items(product_id,quantity,unit_price,total,products(name,sku))")
        .order("created_at", { ascending: false })
        .limit(25)
    )
  );

  measurements.push(
    await measure("repairs_before_waterfall", 2, async () => {
      const repairs = await supabase
        .from("repairs")
        .select("id,repair_access_order_id,customer_name,customer_phone,device,order_number,issue_description,final_price,estimated_price,status,observations,entry_date,created_at,updated_at,repair_access_orders(repair_number)")
        .order("created_at", { ascending: false })
        .limit(25);
      if (repairs.error) return repairs;
      const ids = (repairs.data ?? []).map((repair) => repair.id);
      const payments = ids.length
        ? await supabase.from("repair_payments").select("repair_id,method,amount,created_at").in("repair_id", ids)
        : { data: [], error: null };
      return { data: { repairs: repairs.data, payments: payments.data }, error: payments.error };
    })
  );
  measurements.push(
    await measure("repairs_after_relational", 1, () =>
      supabase
        .from("repairs")
        .select("id,repair_access_order_id,customer_name,customer_phone,device,order_number,issue_description,final_price,estimated_price,status,observations,entry_date,created_at,updated_at,repair_access_orders(repair_number),repair_payments(method,amount,created_at)")
        .order("created_at", { ascending: false })
        .limit(25)
    )
  );

  measurements.push(
    await measure("cash_before_rows", 5, async () => {
      const settings = await supabase.from("app_settings").select("value").eq("key", "cash_runtime").maybeSingle();
      const cutoff = (settings.data?.value as { movementCutoff?: string } | null)?.movementCutoff ?? "2026-04-16T14:21:01.222Z";
      const rows = await Promise.all([
        supabase.from("movimientos_caja").select("id,tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,fecha").gte("fecha", cutoff).order("fecha", { ascending: false }).limit(500),
        supabase.from("movimientos_caja").select("id,tipo,monto,medio_pago,descripcion,referencia_tabla,referencia_id,fecha").gte("fecha", "2026-08-28T03:00:00Z").lt("fecha", "2026-08-29T03:00:00Z"),
        supabase.from("cierres_caja").select("id,fecha,saldo_inicial,ingresos,egresos,saldo_final,observaciones,created_at").order("fecha", { ascending: false }).limit(20),
        supabase.from("balance_transfers").select("id,from_payment_method,to_payment_method,amount,is_voided").order("transfer_date", { ascending: false }).limit(200)
      ]);
      return { data: { settings: settings.data, rows: rows.map((result) => result.data) }, error: settings.error ?? firstError(rows) };
    })
  );
  measurements.push(
    await measure("cash_after_snapshot", 3, async () => {
      const rows = await Promise.all([
        supabase.rpc("get_cash_page_snapshot", { p_day_start: "2026-08-28T03:00:00Z", p_day_end: "2026-08-29T03:00:00Z" }),
        supabase.from("app_settings").select("value").eq("key", "cash_runtime").maybeSingle(),
        supabase.from("balance_transfers").select("id,from_payment_method,to_payment_method,amount,is_voided").order("transfer_date", { ascending: false }).limit(200)
      ]);
      return { data: rows.map((result) => result.data), error: firstError(rows) };
    })
  );

  measurements.push(
    await measure("reports_before_three_waves", 23, async () => {
      const firstWave = await Promise.all([
        supabase.from("sales").select("id,created_by,subtotal,profit_total,sold_at").gte("sold_at", "2026-08-01T03:00:00Z").lt("sold_at", "2026-08-29T03:00:00Z"),
        supabase.from("repairs").select("id,created_by,final_price,estimated_price,entry_date,created_at").gte("entry_date", "2026-08-01").lt("entry_date", "2026-08-29"),
        supabase.from("sale_items").select("quantity,total,unit_cost,products(name,categories(name)),sales!inner(sold_at)").gte("sales.sold_at", "2026-08-01T03:00:00Z").lt("sales.sold_at", "2026-08-29T03:00:00Z"),
        periodQueries("2026-08-01T03:00:00Z", "2026-09-01T03:00:00Z", "2026-08-01", "2026-09-01"),
        periodQueries("2026-07-01T03:00:00Z", "2026-08-01T03:00:00Z", "2026-07-01", "2026-08-01"),
        supabase.from("app_settings").select("value").eq("key", "business_goals").maybeSingle()
      ]) as any[];
      const selected = await periodQueries("2026-08-01T03:00:00Z", "2026-08-29T03:00:00Z", "2026-08-01", "2026-08-29");
      const salesRows = firstWave[0].data ?? [];
      const repairRows = firstWave[1].data ?? [];
      const profileIds = Array.from(new Set([...salesRows, ...repairRows].map((row) => row.created_by).filter(Boolean)));
      const profiles = profileIds.length
        ? await supabase.from("profiles").select("id,full_name").in("id", profileIds)
        : { data: [], error: null };
      const firstWaveResults = firstWave.flatMap((result: any) => Array.isArray(result) ? result : [result]) as Array<QueryResult>;
      return {
        data: { firstWave: firstWaveResults.map((result) => result.data), selected: selected.map((result) => result.data), profiles: profiles.data },
        error: firstError([...firstWaveResults, ...selected, profiles])
      };
    })
  );
  measurements.push(
    await measure("reports_after_snapshot", 2, async () => {
      const rows = await Promise.all([
        supabase.rpc("get_reports_performance_snapshot", {
          p_selected_start: "2026-08-01",
          p_selected_end: "2026-08-29",
          p_current_start: "2026-08-01",
          p_current_end: "2026-09-01",
          p_previous_start: "2026-07-01",
          p_previous_end: "2026-08-01"
        }),
        supabase.from("app_settings").select("value").eq("key", "business_goals").maybeSingle()
      ]);
      return { data: rows.map((result) => result.data), error: firstError(rows) };
    })
  );

  process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
