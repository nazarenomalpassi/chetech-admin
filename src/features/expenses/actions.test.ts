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
