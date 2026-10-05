import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAdmin: requireAdminMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

describe("GET /api/repair-access/storefront-customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca mediante el RPC seguro y devuelve solo datos de contacto permitidos", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "3571000000",
          role: "customer",
          private_note: "no exponer"
        }
      ],
      error: null
    });
    requireAdminMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    createServerSupabaseClientMock.mockResolvedValue({ rpc: rpcMock });

    const { GET } = await import(
      "@/app/api/repair-access/storefront-customers/route"
    );
    const response = await GET(
      new Request("https://admin.chetech.test/api/repair-access/storefront-customers?q=Ada")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpcMock).toHaveBeenCalledWith("search_storefront_customers_for_repair", {
      p_query: "Ada",
      p_limit: 20
    });
    expect(payload).toEqual({
      customers: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "3571000000"
        }
      ]
    });
  });

  it("no cachea ni expone resultados cuando la cuenta no es administradora", async () => {
    requireAdminMock.mockRejectedValue(new Error("Sin permiso"));

    const { GET } = await import(
      "@/app/api/repair-access/storefront-customers/route"
    );
    const response = await GET(
      new Request("https://admin.chetech.test/api/repair-access/storefront-customers?q=Ada")
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.customers).toEqual([]);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});
