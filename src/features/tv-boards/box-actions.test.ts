import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from, rpc: mocks.rpc })
}));
import {
  createTvBoardBoxAction,
  deleteTvBoardBoxAction,
  updateTvBoardBoxAction
} from "./box-actions";

const id = "11111111-1111-4111-8111-111111111111";

function query(result: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "update", "delete"]) {
    builder[key] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "actor" });
});

describe("TV board box actions", () => {
  it("lets the database pick the next number and reports it", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id, number: 4 }], error: null });
    const result = await createTvBoardBoxAction({ label: "  Estante de abajo  " });
    expect(mocks.rpc).toHaveBeenCalledWith("create_tv_board_box", {
      p_label: "Estante de abajo"
    });
    expect(result).toEqual({ success: true, message: "Caja 4 creada", number: 4 });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "tv_board_boxes", action: "insert" })
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/placas-tv");
  });

  it("explains when the boxes are not enabled in the database yet", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    const result = await createTvBoardBoxAction({});
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/todavía no están habilitadas/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("renames a box and keeps its number", async () => {
    mocks.from.mockReturnValue(query({ data: { id, number: 2 }, error: null }));
    const result = await updateTvBoardBoxAction({ id, label: "Placas Samsung" });
    expect(result).toEqual({ success: true, message: "Caja 2 actualizada", number: 2 });
  });

  it("does not delete a box that still holds boards", async () => {
    mocks.from.mockReturnValueOnce(query({ count: 3, error: null }));
    const result = await deleteTvBoardBoxAction(id);
    expect(result).toEqual({
      success: false,
      message: "La caja tiene 3 placas. Movelas a otra caja antes de eliminarla."
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("deletes an empty box", async () => {
    mocks.from
      .mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ data: { id, number: 5 }, error: null }));
    const result = await deleteTvBoardBoxAction(id);
    expect(result).toEqual({ success: true, message: "Caja 5 eliminada" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "tv_board_boxes", action: "delete" })
    );
  });

  it("rejects an invalid box id before touching the database", async () => {
    const result = await deleteTvBoardBoxAction("caja-1");
    expect(result.success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
