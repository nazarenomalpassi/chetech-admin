import { describe, expect, it } from "vitest";

import { getTvBoardSaleStatus, getTvBoardReleaseEvidence, getTvBoardMargin } from "@/features/tv-boards/sales";

describe("getTvBoardSaleStatus", () => {
  it("keeps accounting classification compatible but distinguishes unconfirmed estimates", () => {
    const board = { soldAt: "2026-10-01", releaseDate: "2026-10-04", releasedAt: null };
    expect(getTvBoardSaleStatus(board, "2026-10-05")).toBe("released");
    expect(getTvBoardReleaseEvidence(board, "2026-10-05")).toBe("estimated_due");
    expect(getTvBoardReleaseEvidence({ ...board, releaseDate: null }, "2026-10-05")).toBe("unconfirmed");
    expect(getTvBoardReleaseEvidence({ ...board, releasedAt: "2026-10-05" }, "2026-10-05")).toBe("confirmed");
  });
  it("calculates direct margin only when cost and net revenue are known", () => {
    expect(getTvBoardMargin(100, null)).toBeNull();
    expect(getTvBoardMargin(null, 20)).toBeNull();
    expect(getTvBoardMargin(100, 0)).toBe(100);
    expect(getTvBoardMargin(100.1, 100.2)).toBe(-0.1);
  });
  it("devuelve unsold cuando la placa todavia no se vendio", () => {
    expect(
      getTvBoardSaleStatus({
        soldAt: null,
        releaseDate: null
      }, "2026-05-11")
    ).toBe("unsold");
  });

  it("devuelve pending_release cuando la liberacion todavia no llego", () => {
    expect(
      getTvBoardSaleStatus({
        soldAt: "2026-05-10T14:20:00.000Z",
        releaseDate: "2026-05-14"
      }, "2026-05-11")
    ).toBe("pending_release");
  });

  it("devuelve released cuando la fecha de liberacion ya llego", () => {
    expect(
      getTvBoardSaleStatus({
        soldAt: "2026-05-10T14:20:00.000Z",
        releaseDate: "2026-05-11"
      }, "2026-05-11")
    ).toBe("released");
  });

  it("devuelve released si se confirma manualmente antes de la fecha prevista", () => {
    expect(
      getTvBoardSaleStatus({
        soldAt: "2026-05-10T14:20:00.000Z",
        releaseDate: "2026-05-20",
        releasedAt: "2026-05-11T14:20:00.000Z"
      }, "2026-05-12")
    ).toBe("released");
  });
});
