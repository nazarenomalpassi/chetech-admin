import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const requireUserMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: requireAdminMock,
  requireUser: requireUserMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn()
}));

describe("permisos de ordenes de service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserva la anulacion para administradores", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/dashboard?error=Solo%20admin"));
    requireUserMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });

    const { cancelRepairAccessOrderAction } = await import("@/features/repairs-access/actions");
    const formData = new FormData();
    formData.set("id", "11111111-1111-4111-8111-111111111111");

    await expect(cancelRepairAccessOrderAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?error=Solo%20admin"
    );
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});
