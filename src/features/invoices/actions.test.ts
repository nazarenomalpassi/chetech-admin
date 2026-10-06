import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), audit: vi.fn(), cash: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("@/lib/accounting", () => ({ deleteCashMovement: mocks.cash }));
import { saveInvoiceAction } from "./actions";

describe("atomic invoice action", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const form = () => {
    const data = new FormData();
    data.set("customerName", "Cliente"); data.set("customerPhone", ""); data.set("notes", "");
    data.set("requestId", "00000000-0000-4000-8000-000000000001");
    data.set("itemsJson", JSON.stringify([{ description: "Servicio", quantity: 1, unitPrice: 100 }]));
    return data;
  };
  it("saves header, items, settlement and audit through one RPC only", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "invoice", action: "insert" }, error: null });
    await expect(saveInvoiceAction(form())).rejects.toThrow("invoice_created");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][0]).toBe("save_invoice_atomic");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.cash).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("returns the atomic failure without retrying through non-transactional writes", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Conflicto de version" } });
    await expect(saveInvoiceAction(form())).rejects.toThrow("Conflicto+de+version");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
