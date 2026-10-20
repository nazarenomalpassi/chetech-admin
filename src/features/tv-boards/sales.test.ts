import { describe, expect, it } from "vitest";

import { getTvBoardSaleStatus, getTvBoardReleaseEvidence, getTvBoardMargin, getTvBoardFinancialSummary } from "@/features/tv-boards/sales";

describe("getTvBoardSaleStatus", () => {
  it("never treats an estimated date as a confirmed release", () => {
    const board = { soldAt: "2026-10-01", releaseDate: "2026-10-04", releasedAt: null };
    expect(getTvBoardSaleStatus(board, "2026-10-05")).toBe("pending_release");
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

  it("mantiene pendiente cuando la fecha prevista ya llego", () => {
    expect(
      getTvBoardSaleStatus({
        soldAt: "2026-05-10T14:20:00.000Z",
        releaseDate: "2026-05-11"
      }, "2026-05-11")
    ).toBe("pending_release");
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

describe("claim financial partition", () => {
  const sale = { soldAt: "2026-10-01", releaseDate: "2026-10-02", releasedAt: null, claimStatus: "none" as const, netAmount: 100, acquisitionCost: 20, isActive: false, price: 999999 };
  it("moves an open claim out of pending, even when its estimate is overdue", () => {
    const claimed = { ...sale, claimStatus: "open" as const };
    expect(getTvBoardSaleStatus(claimed, "2026-10-20")).toBe("claim_open");
    expect(getTvBoardReleaseEvidence(claimed, "2026-10-20")).toBe("held");
    expect(getTvBoardFinancialSummary([claimed])).toMatchObject({ pendingAmount: 0, heldAmount: 100, releasedAmount: 0, salesNetAmount: 100 });
  });
  it("removes cancelled sales from proceeds and margin without discarding sale data", () => {
    const cancelled = { ...sale, claimStatus: "cancelled" as const };
    expect(getTvBoardSaleStatus(cancelled, "2026-10-20")).toBe("cancelled");
    expect(getTvBoardFinancialSummary([cancelled])).toMatchObject({ pendingAmount: 0, heldAmount: 0, releasedAmount: 0, salesNetAmount: 0, cancelledAmount: 100, knownMargin: 0 });
  });
  it("restores to pending, not released, and uses net amounts rather than listed prices", () => {
    expect(getTvBoardFinancialSummary([sale])).toMatchObject({ pendingAmount: 100, heldAmount: 0, releasedAmount: 0, salesNetAmount: 100 });
  });
  it("partitions every valid sale exactly once with integer-cent arithmetic", () => {
    const summary = getTvBoardFinancialSummary([
      { ...sale, netAmount: 0.1 }, { ...sale, netAmount: 0.2 },
      { ...sale, claimStatus: "open", netAmount: 50.01 },
      { ...sale, releasedAt: "2026-10-20", netAmount: 70.02 },
      { ...sale, claimStatus: "cancelled", netAmount: 8 },
      { ...sale, soldAt: null, isActive: true, netAmount: null }
    ]);
    expect(summary.pendingAmount).toBe(0.3);
    expect(summary.heldAmount).toBe(50.01);
    expect(summary.releasedAmount).toBe(70.02);
    expect(summary.salesNetAmount).toBe(120.33);
    expect(summary.cancelledAmount).toBe(8);
    expect(summary.activeCount).toBe(1);
  });
  it("does not report held sales as confirmed even for inconsistent legacy input", () => {
    expect(getTvBoardSaleStatus({ ...sale, claimStatus: "open", releasedAt: "2026-10-20" }, "2026-10-20")).toBe("claim_open");
  });
});
