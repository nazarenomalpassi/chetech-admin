import { beforeEach, describe, expect, it, vi } from "vitest";

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
  requireAdmin: vi.fn(),
  requirePermission: requirePermissionMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: createAuditLogMock
}));

describe("updateRepairAccessWorkshopAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega la actualizacion tecnica al RPC restringido", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null
    });
    const orderId = "11111111-1111-4111-8111-111111111111";

    requirePermissionMock.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "tecnico"
    });
    createServerSupabaseClientMock.mockResolvedValue({ rpc: rpcMock });

    const { updateRepairAccessWorkshopAction } = await import("@/features/repairs-access/actions");
    const formData = new FormData();
    formData.set("id", orderId);
    formData.set("status", "en_revision");
    formData.set("repairAmount", "125000");
    formData.set("budgetDetail", "Cambio de fuente.");
    formData.set("repairProgress", "Equipo desarmado y diagnosticado.");

    await expect(updateRepairAccessWorkshopAction(formData)).rejects.toThrow(
      "REDIRECT:/reparaciones-access?status=repair_access_workshop_updated&view=ordenes"
    );

    expect(requirePermissionMock).toHaveBeenCalledWith("repairs.update");
    expect(rpcMock).toHaveBeenCalledWith("update_technician_repair_workshop", {
      p_order_id: orderId,
      p_status: "en_revision",
      p_repair_amount: 125000,
      p_budget_detail: "Cambio de fuente.",
      p_repair_progress: "Equipo desarmado y diagnosticado."
    });
    expect(createAuditLogMock).not.toHaveBeenCalled();
  });

  it("preserva el monto de una orden ya cobrada aunque llegue otro valor desde el formulario", async () => {
    const updateMock = vi.fn();
    const orderId = "11111111-1111-4111-8111-111111111111";

    requirePermissionMock.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "admin"
    });
    updateMock.mockImplementation((payload) => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: { id: orderId }, error: null, payload })
        })
      })
    }));
    createServerSupabaseClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table === "repair_access_status_history") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: orderId,
                  status: "en_revision",
                  finished_at: null,
                  budget_response_at: null,
                  budgeted_at: "2026-07-10T12:00:00.000Z",
                  is_paid: true,
                  budget_amount: 120000,
                  final_amount: 120000
                },
                error: null
              })
            })
          }),
          update: updateMock
        };
      }
    });

    const { updateRepairAccessWorkshopAction } = await import("@/features/repairs-access/actions");
    const formData = new FormData();
    formData.set("id", orderId);
    formData.set("status", "en_revision");
    formData.set("repairAmount", "175000");
    formData.set("budgetDetail", "Se actualiza el detalle, no el cobro.");
    formData.set("repairProgress", "Prueba final completada.");

    await expect(updateRepairAccessWorkshopAction(formData)).rejects.toThrow("REDIRECT:");
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      budget_amount: 120000,
      final_amount: 120000,
      repair_progress: "Prueba final completada."
    });
  });
});
