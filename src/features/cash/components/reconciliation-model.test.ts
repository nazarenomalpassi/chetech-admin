import { describe, expect, it } from "vitest";
import { buildReconciliationAccounts, cashReconciliationSchema } from "./reconciliation-model";

const balances = [{ method: "efectivo", balance: 100.1 }, { method: "nx", balance: -20 }, { method: "mp", balance: 30 }];
const counts = [{ method: "efectivo", expected: 100.1, physical: 100.2, reason: "Sobrante contado" }, { method: "nx", expected: -20, physical: 0, reason: "Saldo bancario conciliado" }, { method: "mp", expected: 30, physical: 30, reason: "" }];

describe("cash reconciliation", () => {
  it("uses server balances and cents without changing them", () => {
    const result = buildReconciliationAccounts(balances, counts);
    expect(result[0]).toMatchObject({ expected: 100.1, physical: 100.2, difference: 0.1 });
    expect(result[1].difference).toBe(20);
    expect(balances[0].balance).toBe(100.1);
  });
  it("rejects stale client snapshots", () => {
    expect(() => buildReconciliationAccounts([{ ...balances[0], balance: 101 }, ...balances.slice(1)], counts)).toThrow(/cambio/i);
  });
  it("requires a reason per difference", () => {
    expect(() => buildReconciliationAccounts(balances, counts.map((count) => ({ ...count, reason: "" })))).toThrow(/justifica/i);
  });
  it("requires each of the three accounts exactly once and an explicit physical count", () => {
    const base = { id: "11111111-1111-4111-8111-111111111111", date: "2026-10-05", accounts: counts };
    expect(cashReconciliationSchema.safeParse(base).success).toBe(true);
    expect(cashReconciliationSchema.safeParse({ ...base, accounts: [counts[0], counts[0], counts[2]] }).success).toBe(false);
    expect(cashReconciliationSchema.safeParse({ ...base, accounts: counts.slice(1) }).success).toBe(false);
    expect(cashReconciliationSchema.safeParse({ ...base, accounts: [{ ...counts[0], physical: "" }, ...counts.slice(1)] }).success).toBe(false);
  });
});
