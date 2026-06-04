export const CASH_METHODS = ["efectivo", "nx", "mp"] as const;

export type CashMethod = (typeof CASH_METHODS)[number];
export type CashLabelContext = "general" | "salary";
export type CashMovementType =
  | "venta"
  | "reparacion"
  | "gasto"
  | "facturacion"
  | "sueldo"
  | "ajuste_ingreso"
  | "ajuste_egreso";

const CASH_INCOME_MOVEMENT_TYPES = ["venta", "reparacion", "facturacion", "ajuste_ingreso"];
const CASH_OUTCOME_MOVEMENT_TYPES = ["gasto", "sueldo", "ajuste_egreso"];
const PROFIT_INCOME_MOVEMENT_TYPES = ["venta", "reparacion", "facturacion"];
const PROFIT_OUTCOME_MOVEMENT_TYPES = ["gasto"];

export const CASH_OPENING_BALANCES: Record<CashMethod, number> = {
  efectivo: 193573,
  nx: 60344,
  mp: 10000
};

export const CASH_MOVEMENT_CUTOFF = "2026-04-16T14:21:01.222Z";

export function normalizeCashMethodValue(method: string | null | undefined): CashMethod | null {
  const normalized = (method ?? "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("efectivo")) return "efectivo";
  if (normalized.includes("mercado") || normalized.includes("nx local") || normalized === "mp" || normalized.includes("local")) {
    return "mp";
  }
  if (normalized.includes("nx")) return "nx";

  return null;
}

function getCashMethodLabelMap(context: CashLabelContext): Record<CashMethod, string> {
  if (context === "salary") {
    return {
      efectivo: "EFECTIVO",
      nx: "NX SANTI",
      mp: "NX LOCAL"
    };
  }

  return {
    efectivo: "EFECTIVO",
    nx: "NX SANTI",
    mp: "NX LOCAL"
  };
}

export function formatCashMethod(method: string, options?: { context?: CashLabelContext }) {
  const normalized = normalizeCashMethodValue(method);

  if (!normalized) return method;

  return getCashMethodLabelMap(options?.context ?? "general")[normalized];
}

export function getCashMethodOptions(context: CashLabelContext = "general") {
  const labels = getCashMethodLabelMap(context);

  return CASH_METHODS.map((method) => ({
    value: method,
    label: labels[method]
  }));
}

export function isCashIncomeMovement(type: string) {
  return CASH_INCOME_MOVEMENT_TYPES.includes(type);
}

export function isCashOutcomeMovement(type: string) {
  return CASH_OUTCOME_MOVEMENT_TYPES.includes(type);
}

export function isProfitIncomeMovement(type: string) {
  return PROFIT_INCOME_MOVEMENT_TYPES.includes(type);
}

export function isProfitOutcomeMovement(type: string) {
  return PROFIT_OUTCOME_MOVEMENT_TYPES.includes(type);
}
