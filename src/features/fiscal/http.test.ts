import { describe, expect, it, vi } from "vitest";
import { requireFiscalAdmin } from "./http";

const mock = vi.hoisted(() => ({ client: {} as any }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mock.client }));
function authClient(role: string, user: object | null = { id: "admin" }) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const getSession = vi.fn();
  mock.client = { auth: { getUser, getSession }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }) }) };
  return { getUser, getSession };
}
describe("fiscal authorization boundary", () => {
  it("uses validated getUser and persisted admin permissions, never getSession or user metadata", async () => {
    const calls = authClient("admin", { id: "admin", user_metadata: { role: "tecnico" } });
    expect((await requireFiscalAdmin()).userId).toBe("admin");
    expect(calls.getUser).toHaveBeenCalledTimes(1);
    expect(calls.getSession).not.toHaveBeenCalled();
  });
  it("denies technicians even if user-editable metadata says admin", async () => {
    authClient("tecnico", { id: "tech", user_metadata: { role: "admin" } });
    await expect(requireFiscalAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("denies unauthenticated requests", async () => {
    authClient("admin", null);
    await expect(requireFiscalAdmin()).rejects.toMatchObject({ status: 401 });
  });
});
