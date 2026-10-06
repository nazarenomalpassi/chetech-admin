import { describe, expect, it } from "vitest";

import { applyBalanceTransferDeltas, normalizeBalanceTransferMethod, toCashMethod } from "@/features/balance-transfers/model";

describe("balance transfer model", () => {
  it("moves money from the origin account to the destination account without changing the total", () => {
    const balances = { efectivo: 100000, nx: 15000, mp: 25000 };

    const result = applyBalanceTransferDeltas(balances, [
      {
        amount: 50000,
        fromPaymentMethod: "efectivo",
        isVoided: false,
        toPaymentMethod: "mp"
      }
    ]);

    expect(result).toEqual({ efectivo: 50000, nx: 15000, mp: 75000 });
    expect(result.efectivo + result.nx + result.mp).toBe(140000);
  });

  it("neutralizes a voided transfer through its reversal movement", () => {
    const balances = { efectivo: 100000, nx: 15000, mp: 25000 };

    const result = applyBalanceTransferDeltas(balances, [
      {
        amount: 50000,
        fromPaymentMethod: "efectivo",
        isVoided: true,
        toPaymentMethod: "mp"
      },
      {
        amount: 50000,
        fromPaymentMethod: "mp",
        isVoided: false,
        toPaymentMethod: "efectivo"
      }
    ]);

    expect(result).toEqual(balances);
  });

  it("normalizes only operational cash methods and excludes external MP pending release", () => {
    expect(normalizeBalanceTransferMethod("Efectivo")).toBe("efectivo");
    expect(normalizeBalanceTransferMethod("NX SANTI")).toBe("nx_santi");
    expect(normalizeBalanceTransferMethod("NX LOCAL")).toBe("nx_local");
    expect(normalizeBalanceTransferMethod("MP PENDIENTE DE LIBERACION")).toBeNull();
    expect(toCashMethod("NX SANTI")).toBe("nx");
    expect(toCashMethod("NX LOCAL")).toBe("mp");
  });
});
