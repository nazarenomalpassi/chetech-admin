import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), audit: vi.fn(), update: vi.fn(), read: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url).replaceAll("+", " ")); } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { cancelRepairOutsourcingAction, markRepairOutsourcingRetrievedAction, recordRepairOutsourcingQualityAction, updateRepairOutsourcingFollowupAction } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-10-05T10:00:00Z";
function form(values: Record<string, string>) { const result = new FormData(); Object.entries(values).forEach(([key, value]) => result.set(key, value)); return result; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "actor" });
  const query = { select: vi.fn(), eq: mocks.eq, update: mocks.update, maybeSingle: mocks.read };
  query.select.mockReturnValue(query); mocks.eq.mockReturnValue(query); mocks.update.mockReturnValue(query); mocks.from.mockReturnValue(query);
  mocks.read.mockResolvedValueOnce({ data: { id, status: "en_taller", sent_at: "2026-10-05", updated_at: updatedAt, notes: "Historia original" }, error: null }).mockResolvedValue({ data: { id }, error: null });
});
describe("outsourcing operations", () => {
  it("records return and quality without changing the linked REP, payments or client delivery", async () => {
    await expect(markRepairOutsourcingRetrievedAction(form({ id, expectedUpdatedAt: updatedAt, retrievedAt: "2026-10-06", actualCost: "0", qualityStatus: "aprobado", qualityNotes: "Imagen y sonido probados", notes: "Recibido en mostrador" }))).rejects.toThrow(/outsourcing_retrieved/);
    const payload = mocks.update.mock.calls[0][0];
    expect(payload).toMatchObject({ status: "retirado", actual_cost: 0, quality_status: "aprobado", quality_checked_by: "actor" });
    expect(payload.notes).toContain("Historia original");
    expect(payload.notes).toContain("Imagen y sonido probados");
    expect(payload).not.toHaveProperty("repair_access_order_id");
    expect(mocks.from.mock.calls.every(([table]) => table === "repair_outsourcings")).toBe(true);
  });
  it("rejects a stale followup without overwriting history", async () => {
    await expect(updateRepairOutsourcingFollowupAction(form({ id, expectedUpdatedAt: "old", responsibleName: "Juan", promisedAt: "2026-10-06", expectedCost: "10" }))).rejects.toThrow(/cambio/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("appends consultation notes and preserves dispatch and REP", async () => {
    await expect(updateRepairOutsourcingFollowupAction(form({ id, expectedUpdatedAt: updatedAt, responsibleName: "Juan", promisedAt: "2026-10-06", expectedCost: "10", notes: "Confirmaron fecha" }))).rejects.toThrow(/outsourcing_updated/);
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.notes).toContain("Historia original"); expect(payload.notes).toContain("Confirmaron fecha");
    expect(payload).not.toHaveProperty("sent_at"); expect(payload).not.toHaveProperty("repair_access_order_id");
    expect(mocks.eq).toHaveBeenCalledWith("updated_at", updatedAt);
  });
  it("requires return before recording a quality approval", async () => {
    await expect(recordRepairOutsourcingQualityAction(form({ id, expectedUpdatedAt: updatedAt, qualityStatus: "aprobado", qualityNotes: "Pruebas" }))).rejects.toThrow(/primero el retorno/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not report a concurrent lost update as success", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ data: { id, status: "en_taller", sent_at: "2026-10-05", updated_at: updatedAt, notes: "Historia" }, error: null }).mockResolvedValue({ data: null, error: null });
    await expect(markRepairOutsourcingRetrievedAction(form({ id, retrievedAt: "2026-10-06" }))).rejects.toThrow(/registro cambio/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("cannot cancel a returned item or erase its history", async () => {
    mocks.read.mockReset().mockResolvedValue({ data: { id, status: "retirado", notes: "Retorno", updated_at: updatedAt }, error: null });
    await expect(cancelRepairOutsourcingAction(form({ id }))).rejects.toThrow(/salida activa/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
