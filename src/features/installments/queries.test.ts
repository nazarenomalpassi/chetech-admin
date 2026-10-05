import { describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: database.from }) }));

import { getInstallmentSalesData, isInstallmentsUnavailableError } from "@/features/installments/queries";

describe("isInstallmentsUnavailableError", () => {
  it("treats permission denied on installments as unavailable dashboard data", () => {
    expect(isInstallmentsUnavailableError({ message: "permission denied for table installments" })).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isInstallmentsUnavailableError({ message: "network timeout" })).toBe(false);
  });
  it("reads and exposes the financial version of each displayed installment", async () => {
    database.from.mockReturnValue({ select: database.select });
    database.select.mockReturnValue({ order: database.order });
    database.order.mockReturnValue({ limit: database.limit });
    database.limit.mockResolvedValue({ error: null, data: [{ id: "sale", status: "activa", installments: [{ id: "installment", installment_number: 1, amount: 100, financial_version: 7, due_date: "2026-11-05", status: "pendiente" }] }] });
    const data = await getInstallmentSalesData({});
    expect(database.select).toHaveBeenCalledWith(expect.stringContaining("financial_version"));
    expect(data.sales[0].installments[0].financialVersion).toBe(7);
  });
});
