import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, createClient, rpc } = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: createClient }));
const orderId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const date = "2026-10-05T12:00:00.123456+00:00";
async function get(query = "") {
  const { GET } = await import("./route");
  return GET(new Request(`https://local.test/api/repair-access/activity?orderId=${orderId}${query}`));
}
beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ role: "tecnico" });
  createClient.mockResolvedValue({ rpc });
  rpc.mockResolvedValue({ data: { events: [], nextCursor: null }, error: null });
});

describe("private paged workshop activity", () => {
  it("guards operations before any database request", async () => {
    requirePermission.mockRejectedValue(new Error("redirect"));
    const response = await get();
    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("repairs.view");
    expect(createClient).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("uses the safe read RPC, defaults to 20 and excludes raw audit/financial fields", async () => {
    rpc.mockResolvedValue({ data: { events: [{ id: eventId, kind: "update", message: "Estado actualizado", actorName: "Tecnico", createdAt: date, actor_id: "private", audit_notes: "secret", amount: 123 }], nextCursor: null, audit: "secret" }, error: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_workshop_activity_page", { p_order_id: orderId, p_cursor_date: null, p_cursor_id: null, p_limit: 20 });
    expect(await response.json()).toEqual({ events: [{ id: eventId, kind: "update", message: "Estado actualizado", actorName: "Tecnico", createdAt: date }], nextCursor: null });
  });
  it("caps output at 30 and preserves the oldest cursor's microseconds and ID", async () => {
    await get(`&limit=100&cursorDate=${encodeURIComponent(date)}&cursorId=${eventId}`);
    expect(rpc).toHaveBeenCalledWith("get_workshop_activity_page", { p_order_id: orderId, p_cursor_date: date, p_cursor_id: eventId, p_limit: 30 });
  });
  it.each(["&cursorId=bad", `&cursorId=${eventId}`, "&cursorDate=not-a-date&cursorId=bad", "&limit=0", "&limit=1.5"])("rejects malformed or partial cursors: %s", async (query) => {
    expect((await get(query)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["P0002", 404], ["42501", 403], ["PGRST202", 503], ["42883", 503], ["XX000", 500]])("blocks missing/denied orders and hides raw errors: %s", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private financial/audit note" } });
    const response = await get();
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private financial/audit note");
  });
  it("fails closed instead of silently truncating a malformed page", async () => {
    rpc.mockResolvedValue({ data: { events: [], nextCursor: { date, id: eventId } }, error: null });
    expect((await get()).status).toBe(500);
  });
});
