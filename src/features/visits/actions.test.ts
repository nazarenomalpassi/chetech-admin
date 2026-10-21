import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth, requirePermission: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { deleteVisitAction, saveVisitAction, updateVisitStatusAction } from "./actions";
import { parseVisitNotes, serializeVisitNotes } from "./schemas";
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
  it("leaves hidden legacy assignment, notes and REP columns untouched on a simple edit", async () => {
    await expect(saveVisitAction(form({ ...valid, id, expectedUpdatedAt: "2026-10-05T10:00:00Z", status: "confirmada" }))).rejects.toThrow(/visit_updated/);
    const payload = mocks.update.mock.calls[0][0];
    for (const column of ["technician_id", "technician_name", "notes", "repair_access_order_id"]) expect(payload).not.toHaveProperty(column);
    expect(payload).toMatchObject({ status: "confirmada", time_from: "09:00", time_to: "10:00" });
  });
  it("always creates visits pending, even if an old draft sends another state", async () => {
    await expect(saveVisitAction(form({ ...valid, status: "realizada" }))).rejects.toThrow(/visit_created/);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "pendiente" }));
  });
  it("preserves exact legacy notes while adding a tool checklist", async () => {
    const notes = "  Tocar timbre\nReferencia: patio  ";
    await expect(saveVisitAction(form({ ...valid, notes, toolsRequired: "yes", toolsDetail: "Escalera" }))).rejects.toThrow(/visit_created/);
    expect(mocks.insert.mock.calls[0][0].notes).toContain(notes);
    expect(mocks.insert.mock.calls[0][0].notes).toContain("Escalera");
  });
  it("rejects tools without a checklist note rather than silently saving an incomplete request", async () => {
    await expect(saveVisitAction(form({ ...valid, toolsRequired: "yes", toolsDetail: "" }))).rejects.toThrow(/herramientas/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keeps notes from the saved row when only the checklist is submitted on edit", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { notes: "No retirar equipo" }, error: null });
    await expect(saveVisitAction(form({ ...valid, id, expectedUpdatedAt: "2026-10-05T10:00:00Z", toolsRequired: "no" }))).rejects.toThrow(/visit_updated/);
    expect(mocks.update.mock.calls[0][0].notes).toContain("No retirar equipo");
  });
  it("rejects a combined checklist exceeding the existing notes column without truncation", async () => {
    await expect(saveVisitAction(form({ ...valid, notes: "x".repeat(1950), toolsRequired: "yes", toolsDetail: "Escalera" }))).rejects.toThrow(/2000/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("leaves notes untouched in quick state changes", async () => {
    await expect(updateVisitStatusAction(form({ id, status: "realizada", expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/visit_status_updated/);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("notes");
  });
  it("merges a technician's appended note with saved tools without rewriting hidden business fields", async () => {
    const stored = serializeVisitNotes({ notes: "Tocar timbre", toolsRequired: "yes", toolsDetail: "Escalera y tester" });
    mocks.maybeSingle.mockResolvedValue({ data: { notes: stored, updated_at: "2026-10-05T10:00:00Z" }, error: null });
    await expect(updateVisitStatusAction(form({ id, status: "realizada", expectedUpdatedAt: "2026-10-05T10:00:00Z", notes: `${stored}\nRevision realizada` }))).rejects.toThrow(/visit_status_updated/);
    const payload = mocks.update.mock.calls[0][0];
    expect(parseVisitNotes(payload.notes)).toEqual({ notes: "Tocar timbre\nRevision realizada", toolsRequired: "yes", toolsDetail: "Escalera y tester" });
    for (const key of ["technician_id", "technician_name", "repair_access_order_id", "visit_date", "time_from", "time_to"]) expect(payload).not.toHaveProperty(key);
  });
  it("keeps the saved checklist even when a technician clears all plain observations", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { notes: serializeVisitNotes({ notes: "Nota anterior", toolsRequired: "no", toolsDetail: "" }), updated_at: "2026-10-05T10:00:00Z" }, error: null });
    await expect(updateVisitStatusAction(form({ id, status: "confirmada", notes: "", expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/visit_status_updated/);
    expect(parseVisitNotes(mocks.update.mock.calls[0][0].notes)).toEqual({ notes: "", toolsRequired: "no", toolsDetail: "" });
  });
  it("does not erase a malformed legacy marker or treat technician text as a new checklist", async () => {
    const notes = "  Herramientas: consultar\n\n[chetech:visit-tools:v1]\ninvalid\n[/chetech:visit-tools]\nTrabajo realizado  ";
    mocks.maybeSingle.mockResolvedValue({ data: { notes, updated_at: "2026-10-05T10:00:00Z" }, error: null });
    await expect(updateVisitStatusAction(form({ id, status: "realizada", notes, expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/visit_status_updated/);
    expect(mocks.update.mock.calls[0][0].notes).toBe(notes);
    expect(mocks.maybeSingle).toHaveBeenCalled();
  });
  it("refuses a notes edit if its saved checklist cannot be read at the expected version", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(updateVisitStatusAction(form({ id, status: "realizada", notes: "Nuevo texto", expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/cambio/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects merged observations that exceed the existing limit without truncating the checklist", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { notes: serializeVisitNotes({ notes: "", toolsRequired: "yes", toolsDetail: "Tester" }), updated_at: "2026-10-05T10:00:00Z" }, error: null });
    await expect(updateVisitStatusAction(form({ id, status: "realizada", notes: "x".repeat(1950), expectedUpdatedAt: "2026-10-05T10:00:00Z" }))).rejects.toThrow(/2000/);
    expect(mocks.update).not.toHaveBeenCalled();
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
