import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth, requirePermission: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { deleteVisitAction, saveVisitAction, updateVisitStatusAction } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string, string>) {
  const result = new FormData(); Object.entries(values).forEach(([key, value]) => result.set(key, value)); return result;
}
const valid = { customerName: "Juan", customerPhone: "341", address: "Local", visitDate: "2026-10-05", timeFrom: "09:00", timeTo: "10:00", reason: "Revision" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: "actor" });
  const query = { select: vi.fn(), eq: vi.fn(), update: mocks.update, insert: mocks.insert, single: mocks.single, maybeSingle: mocks.maybeSingle };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.update.mockReturnValue(query); mocks.insert.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { id }, error: null });
});
describe("visit server actions", () => {
  it("does not duplicate a new visit when a persisted draft is retried after a lost response", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id }, error: null });
    await expect(saveVisitAction(form({ ...valid, draftToken: id, draftVisitId: "new" }))).rejects.toThrow(/visit_already_created/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects an edit with no concurrency version before writing", async () => {
    await expect(saveVisitAction(form({ ...valid, id }))).rejects.toThrow(/version/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("translates a database overlap including concurrent booking failures", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23P01" } });
    await expect(saveVisitAction(form(valid))).rejects.toThrow(/superpone/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does not rewrite the original creator on edit", async () => {
    await expect(saveVisitAction(form({ ...valid, id, expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/visit_updated/);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("created_by");
  });
  it("resolves a human REP number before persisting the link", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id }, error: null });
    await expect(saveVisitAction(form({ ...valid, repairNumber: "266" }))).rejects.toThrow(/visit_created/);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ repair_access_order_id: id }));
  });
  it("rejects a technician profile not belonging to local staff", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id, role: "customer" }, error: null });
    await expect(saveVisitAction(form({ ...valid, technicianId: id }))).rejects.toThrow(/tecnico.valido/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects reactivation when a cancelled slot is now occupied", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23P01" } });
    await expect(updateVisitStatusAction(form({ id, status: "confirmada" }))).rejects.toThrow(/reabrir/);
  });
  it("cancels instead of destroying business history", async () => {
    await expect(deleteVisitAction(form({ id }))).rejects.toThrow(/visit_cancelled/);
    expect(mocks.update).toHaveBeenCalledWith({ status: "cancelada" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "update" }));
  });
});
