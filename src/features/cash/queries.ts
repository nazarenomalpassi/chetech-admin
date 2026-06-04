import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCashSettings } from "@/lib/app-settings";
import { CASH_METHODS, normalizeCashMethodValue, type CashMethod } from "@/lib/cash";

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

export async function getCashData() {
  const supabase = await createServerSupabaseClient();
  const cashSettings = await getCashSettings();
  const today = getArgentinaDayRange(new Date());

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
      balance: cashSettings.openingBalances[method] + income - outcome
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
