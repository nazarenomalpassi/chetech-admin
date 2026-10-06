export const CASH_METHODS = ["efectivo", "nx", "mp"] as const;

export type CashMethod = (typeof CASH_METHODS)[number];
export type CashLabelContext = "general" | "salary";

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
