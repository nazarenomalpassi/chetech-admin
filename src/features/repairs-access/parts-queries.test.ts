import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ rpc: mock.rpc }) }));
import { getWorkshopPartsPage, getSupplierClaimsPage } from "./parts-queries";
beforeEach(() => vi.clearAllMocks());
describe("bandejas paginadas de repuestos", () => {
  it("carga cantidades globales y pagina sin truncar a cien pendientes", async () => {
    const page = { items: [], total: 152, page: 3, pageSize: 50, counts: { requested: 100, ordered: 30, available: 22, overdue: 4, claims: 1 } };
    mock.rpc.mockResolvedValue({ data: page, error: null });
    expect(await getWorkshopPartsPage({ page: "3", search: "fuente", status: "available" })).toEqual(page);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_workshop_parts_page", { p_page: 3, p_search: "fuente", p_status: "available" });
  });
  it("normaliza URL invalida y no oculta un error de permisos", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "Sin permiso" } });
    await expect(getWorkshopPartsPage({ page: "-4", status: "bad" })).rejects.toThrow("Sin permiso");
    expect(mock.rpc.mock.calls[0][1]).toEqual({ p_page: 1, p_search: "", p_status: "all" });
  });
  it("separa historial de reclamos cerrados y no lo confunde con garantias", async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    mock.rpc.mockResolvedValue({ data: page, error: null });
    expect(await getSupplierClaimsPage({ closed: true })).toEqual(page);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_workshop_supplier_claims", { p_closed: true, p_page: 1 });
  });
});
