import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCashSettings } from "@/lib/app-settings";
import { calculateBalanceTransferDeltas } from "@/features/balance-transfers/model";
import { getBalanceTransfers } from "@/features/balance-transfers/queries";
import { CASH_METHODS, normalizeCashMethodValue } from "@/lib/cash";
import {
  normalizeCashPerformanceSnapshot,
  type CashSummarySnapshotRow
} from "@/features/cash/performance-snapshot";
import { isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";
import type { CashMethod } from "@/lib/cash";

const ARGENTINA_UTC_OFFSET_HOURS = 3;

function getArgentinaDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getArgentinaDayRange(date: Date) {
  const today = getArgentinaDateString(date);
  const [year, month, day] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, ARGENTINA_UTC_OFFSET_HOURS, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    date: today,
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function isIncome(type: string) {
  return type === "venta" || type === "reparacion" || type === "facturacion";
}

function isOutcome(type: string) {
  return type === "gasto" || type === "sueldo";
}

async function getLegacyCashData({
  supabase,
  cashSettings,
  today,
  balanceTransfers
}: {
  supabase: any;
  cashSettings: Awaited<ReturnType<typeof getCashSettings>>;
  today: ReturnType<typeof getArgentinaDayRange>;
  balanceTransfers: Awaited<ReturnType<typeof getBalanceTransfers>>;
}) {
  const [allMovementsResult, todayMovementsResult, closuresResult] = await Promise.all([
    (supabase as any)
      .from("movimientos_caja")
      .select("id, tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id, fecha")
      .gte("fecha", cashSettings.movementCutoff)
      .order("fecha", { ascending: false })
      .limit(500),
    (supabase as any)
      .from("movimientos_caja")
      .select("id, tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id, fecha")
      .gte("fecha", today.startIso)
      .lt("fecha", today.endIso)
      .order("fecha", { ascending: false }),
    (supabase as any)
      .from("cierres_caja")
      .select("id, fecha, saldo_inicial, ingresos, egresos, saldo_final, observaciones, created_at")
      .order("fecha", { ascending: false })
      .limit(20)
  ]);

  if (allMovementsResult.error) throw new Error(allMovementsResult.error.message);
  if (todayMovementsResult.error) throw new Error(todayMovementsResult.error.message);
  if (closuresResult.error) throw new Error(closuresResult.error.message);

  const movements = (allMovementsResult.data ?? []) as any[];
  const todayMovements = (todayMovementsResult.data ?? []) as any[];
  const transferDeltas = calculateBalanceTransferDeltas(
    balanceTransfers.map((transfer) => ({
      amount: transfer.amount,
      fromPaymentMethod: transfer.fromPaymentMethod,
      isVoided: transfer.isVoided,
      toPaymentMethod: transfer.toPaymentMethod
    }))
  );

  const balances = CASH_METHODS.map((method) => {
    const methodMovements = movements.filter((movement) => normalizeCashMethodValue(movement.medio_pago) === method);
    const income = methodMovements
      .filter((movement) => isIncome(movement.tipo))
      .reduce((acc, movement) => acc + Number(movement.monto), 0);
    const outcome = methodMovements
      .filter((movement) => isOutcome(movement.tipo))
      .reduce((acc, movement) => acc + Number(movement.monto), 0);

    const todayIncome = todayMovements
      .filter((movement) => normalizeCashMethodValue(movement.medio_pago) === method && isIncome(movement.tipo))
      .reduce((acc, movement) => acc + Number(movement.monto), 0);
    const todayOutcome = todayMovements
      .filter((movement) => normalizeCashMethodValue(movement.medio_pago) === method && isOutcome(movement.tipo))
      .reduce((acc, movement) => acc + Number(movement.monto), 0);

    return {
      method,
      openingBalance: cashSettings.openingBalances[method],
      income,
      outcome,
      todayIncome,
      todayOutcome,
      balance: cashSettings.openingBalances[method] + income - outcome + transferDeltas[method]
    };
  });

  const todayIncome = todayMovements
    .filter((movement) => isIncome(movement.tipo))
    .reduce((acc, movement) => acc + Number(movement.monto), 0);
  const todayOutcome = todayMovements
    .filter((movement) => isOutcome(movement.tipo))
    .reduce((acc, movement) => acc + Number(movement.monto), 0);
  const totalBalance = balances.reduce((acc, item) => acc + item.balance, 0);

  return {
    today: today.date,
    balances,
    todayIncome,
    todayOutcome,
    totalBalance,
    recentMovements: movements.slice(0, 80).map((movement) => ({
      id: movement.id,
      type: movement.tipo,
      amount: Number(movement.monto),
      method: normalizeCashMethodValue(movement.medio_pago) ?? movement.medio_pago,
      description: movement.descripcion ?? "",
      referenceTable: movement.referencia_tabla ?? "",
      date: movement.fecha
    })),
    closures: (closuresResult.data ?? []).map((closure: any) => ({
      id: closure.id,
      date: closure.fecha,
      openingBalance: Number(closure.saldo_inicial),
      income: Number(closure.ingresos),
      outcome: Number(closure.egresos),
      finalBalance: Number(closure.saldo_final),
      observations: closure.observaciones ?? ""
    }))
  };
}

export async function getCashData() {
  const supabase = await createServerSupabaseClient();
  const today = getArgentinaDayRange(new Date());
  const [snapshotResult, cashSettings, balanceTransfers] = await Promise.all([
    (supabase as any).rpc("get_cash_page_snapshot", {
      p_day_start: today.startIso,
      p_day_end: today.endIso
    }),
    getCashSettings(),
    getBalanceTransfers(supabase as any)
  ]);

  if (snapshotResult.error) {
    if (!isMissingDatabaseFunctionError(snapshotResult.error, "get_cash_page_snapshot")) {
      throw new Error(snapshotResult.error.message);
    }

    return getLegacyCashData({ supabase, cashSettings, today, balanceTransfers });
  }

  const snapshot = normalizeCashPerformanceSnapshot(snapshotResult.data);
  const summaryByMethod = new Map<CashMethod, CashSummarySnapshotRow>();
  for (const row of snapshot.cashSummary) {
    const method = normalizeCashMethodValue(row.medio_pago);
    if (method) summaryByMethod.set(method, row);
  }
  const transferDeltas = calculateBalanceTransferDeltas(
    balanceTransfers.map((transfer) => ({
      amount: transfer.amount,
      fromPaymentMethod: transfer.fromPaymentMethod,
      isVoided: transfer.isVoided,
      toPaymentMethod: transfer.toPaymentMethod
    }))
  );
  const balances = CASH_METHODS.map((method) => {
    const summary = summaryByMethod.get(method);
    const income = summary?.total_income ?? 0;
    const outcome = summary?.total_outcome ?? 0;

    return {
      method,
      openingBalance: cashSettings.openingBalances[method],
      income,
      outcome,
      todayIncome: summary?.period_income ?? 0,
      todayOutcome: summary?.period_outcome ?? 0,
      balance: cashSettings.openingBalances[method] + income - outcome + transferDeltas[method]
    };
  });

  return {
    today: today.date,
    balances,
    todayIncome: balances.reduce((acc, item) => acc + item.todayIncome, 0),
    todayOutcome: balances.reduce((acc, item) => acc + item.todayOutcome, 0),
    totalBalance: balances.reduce((acc, item) => acc + item.balance, 0),
    recentMovements: snapshot.recentMovements,
    closures: snapshot.closures
  };
}
