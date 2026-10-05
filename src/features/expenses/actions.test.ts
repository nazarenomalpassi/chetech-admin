import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const createAuditLogMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: requireAdminMock,
  requireUser: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: createAuditLogMock
}));

vi.mock("@/lib/accounting", () => ({
  deleteCashMovement: vi.fn(),
  replaceCashMovement: vi.fn()
}));

describe("deleteExpenseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("protege la eliminacion cuando requireAdmin no autoriza", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/dashboard?error=Solo%20admin"));

    const { deleteExpenseAction } = await import("@/features/expenses/actions");
    const formData = new FormData();
    formData.set("id", "11111111-1111-4111-8111-111111111111");

    await expect(deleteExpenseAction(formData)).rejects.toThrow("REDIRECT:/dashboard?error=Solo%20admin");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(createAuditLogMock).not.toHaveBeenCalled();
  });
});

describe("purchase linkage actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin" });
  });

  it("links an existing expense through metadata RPC only", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "expense" }, error: null });
    const from = vi.fn();
    createServerSupabaseClientMock.mockResolvedValue({ rpc, from });
    const { linkExpensePurchaseAction } = await import("./actions");
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("partRequestId", "22222222-2222-4222-8222-222222222222");
    await expect(linkExpensePurchaseAction(form)).rejects.toThrow("expense_linked");
    expect(rpc).toHaveBeenCalledWith("link_expense_purchase_atomic", {
      p_expense_id: form.get("id"), p_part_request_id: form.get("partRequestId"),
      p_repair_order_id: null, p_expected_order_id: null, p_expected_part_id: null
    });
    expect(from).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/sueldos");
  });

  it("fails closed when atomic purchase linkage is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "42883", message: "migration missing" } });
    const from = vi.fn();
    createServerSupabaseClientMock.mockResolvedValue({ rpc, from });
    const { saveExpenseAction } = await import("./actions");
    const form = new FormData();
    for (const [key, value] of Object.entries({ operationId: "11111111-1111-4111-8111-111111111111", expenseDate: "2026-10-05", type: "Parts", description: "Paid", amount: "100", paymentMethod: "nx" })) form.set(key, value);
    await expect(saveExpenseAction(form)).rejects.toThrow("migration");
    expect(rpc.mock.calls[0][0]).toBe("save_expense_linked_atomic");
    expect(from).not.toHaveBeenCalled();
  });

  it("preserves the UUID and does not clear links during a financial edit", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    createServerSupabaseClientMock.mockResolvedValue({ rpc });
    const { saveExpenseAction } = await import("./actions");
    const form = new FormData();
    for (const [key, value] of Object.entries({ id: "22222222-2222-4222-8222-222222222222", operationId: "11111111-1111-4111-8111-111111111111", expenseDate: "2026-10-05", type: "Parts", description: "Paid", amount: "100", paymentMethod: "nx" })) form.set(key, value);
    await expect(saveExpenseAction(form)).rejects.toThrow("expense_updated");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_operation_id: form.get("operationId"), p_payload: { id: form.get("id"), amount: 100 } });
    expect(rpc.mock.calls[0][1].p_payload).not.toHaveProperty("partRequestId");
  });
});
