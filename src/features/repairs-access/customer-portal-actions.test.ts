import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const requirePermissionMock = vi.fn();
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
  requirePermission: requirePermissionMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: createAuditLogMock
}));

describe("acciones del portal de reparaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("vincula una cuenta mediante el RPC reservado al administrador", async () => {
    const orderId = "11111111-1111-4111-8111-111111111111";
    const customerId = "22222222-2222-4222-8222-222222222222";
    const rpcMock = vi.fn().mockResolvedValue({
      data: { repair_order_id: orderId, customer_user_id: customerId, linked: true },
      error: null
    });
    requireAdminMock.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });
    createServerSupabaseClientMock.mockResolvedValue({ rpc: rpcMock });

    const { setRepairCustomerLinkAction } = await import(
      "@/features/repairs-access/actions"
    );
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("customerUserId", customerId);

    await expect(setRepairCustomerLinkAction(formData)).rejects.toThrow(
      `REDIRECT:/reparaciones-access?status=repair_customer_link_updated&order=${orderId}`
    );
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("link_repair_to_storefront_customer", {
      p_order_id: orderId,
      p_customer_user_id: customerId
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/reparaciones-access");
    expect(createAuditLogMock).not.toHaveBeenCalled();
  });

  it("permite al tecnico publicar solo mediante el RPC seguro", async () => {
    const orderId = "11111111-1111-4111-8111-111111111111";
    const rpcMock = vi.fn().mockResolvedValue({
      data: { repair_order_id: orderId, update_published: true },
      error: null
    });
    requirePermissionMock.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      role: "tecnico"
    });
    createServerSupabaseClientMock.mockResolvedValue({ rpc: rpcMock });

    const { updateRepairCustomerPortalAction } = await import(
      "@/features/repairs-access/actions"
    );
    const formData = new FormData();
    formData.set("id", orderId);
    formData.set("publicProgress", "Diagnostico finalizado.");
    formData.set("publicNextStep", "Confirma si queres avanzar.");
    formData.set("customerActionRequired", "on");
    formData.set("budgetVisibleToCustomer", "on");
    formData.set("publicBudgetDescription", "Cambio de placa y pruebas.");
    formData.set("budgetValidUntil", "2026-08-15");
    formData.set("publishUpdate", "on");
    formData.set("returnToOrders", "true");

    await expect(updateRepairCustomerPortalAction(formData)).rejects.toThrow(
      `REDIRECT:/reparaciones-access?status=repair_customer_portal_updated&order=${orderId}&view=ordenes`
    );
    expect(requirePermissionMock).toHaveBeenCalledWith("repairs.update");
    expect(rpcMock).toHaveBeenCalledWith("update_repair_customer_portal", {
      p_order_id: orderId,
      p_public_progress: "Diagnostico finalizado.",
      p_public_next_step: "Confirma si queres avanzar.",
      p_customer_action_required: true,
      p_budget_visible_to_customer: true,
      p_public_budget_description: "Cambio de placa y pruebas.",
      p_budget_valid_until: "2026-08-15",
      p_publish_update: true
    });
    expect(createAuditLogMock).not.toHaveBeenCalled();
  });
});
