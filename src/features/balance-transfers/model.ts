import { CASH_METHODS, type CashMethod, normalizeCashMethodValue } from "@/lib/cash";

export const BALANCE_TRANSFER_METHODS = ["efectivo", "nx_santi", "nx_local"] as const;

export type BalanceTransferMethod = (typeof BALANCE_TRANSFER_METHODS)[number];
export type BalanceTransferDelta = {
  amount: number;
  fromPaymentMethod: string;
  isVoided?: boolean;
  toPaymentMethod: string;
};

export type CashMethodBalances = Record<CashMethod, number>;

const METHOD_ALIASES: Record<BalanceTransferMethod, CashMethod> = {
  efectivo: "efectivo",
  nx_santi: "nx",
  nx_local: "mp"
};

export function normalizeBalanceTransferMethod(value: string | null | undefined): BalanceTransferMethod | null {
  const normalized = (value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");

  if (!normalized) return null;
  if (normalized === "efectivo" || normalized.includes("cash")) return "efectivo";
  if (normalized === "nx" || normalized === "nx_santi" || normalized.includes("santi")) return "nx_santi";
  if (normalized === "nx_local" || normalized.includes("local")) return "nx_local";

  return null;
}

export function toCashMethod(value: string | null | undefined): CashMethod | null {
  const balanceMethod = normalizeBalanceTransferMethod(value);

  if (balanceMethod) {
    return METHOD_ALIASES[balanceMethod];
  }

  return normalizeCashMethodValue(value);
}

export function formatBalanceTransferMethod(value: string | null | undefined) {
  const method = normalizeBalanceTransferMethod(value);

  if (method === "efectivo") return "Efectivo";
  if (method === "nx_santi") return "NX SANTI";
  if (method === "nx_local") return "NX LOCAL";

  return value ?? "";
}

export function getBalanceTransferMethodOptions() {
  return BALANCE_TRANSFER_METHODS.map((method) => ({
    value: method,
    label: formatBalanceTransferMethod(method)
  }));
}

export function getEmptyCashMethodBalances(): CashMethodBalances {
  return CASH_METHODS.reduce(
    (acc, method) => ({
      ...acc,
      [method]: 0
    }),
    {} as CashMethodBalances
  );
}

export function calculateBalanceTransferDeltas(transfers: BalanceTransferDelta[]): CashMethodBalances {
  const deltas = getEmptyCashMethodBalances();

  for (const transfer of transfers) {
    if (transfer.amount <= 0) continue;

    const fromMethod = toCashMethod(transfer.fromPaymentMethod);
    const toMethod = toCashMethod(transfer.toPaymentMethod);

    if (!fromMethod || !toMethod || fromMethod === toMethod) continue;

    deltas[fromMethod] -= transfer.amount;
    deltas[toMethod] += transfer.amount;
  }

  return deltas;
}

export function applyBalanceTransferDeltas(
  balances: CashMethodBalances,
  transfers: BalanceTransferDelta[]
): CashMethodBalances {
  const deltas = calculateBalanceTransferDeltas(transfers);

  return CASH_METHODS.reduce(
    (acc, method) => ({
      ...acc,
      [method]: balances[method] + deltas[method]
    }),
    {} as CashMethodBalances
  );
}
