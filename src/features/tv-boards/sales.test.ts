import { describe, expect, it } from "vitest";

import { getTvBoardSaleStatus } from "@/features/tv-boards/sales";

describe("getTvBoardSaleStatus", () => {
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
});
