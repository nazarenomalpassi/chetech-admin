import { describe, expect, it } from "vitest";

import {
  buildRepairOrderRenumberPlan,
  formatRepairOrderNumber,
  parseRepairOrderNumber
} from "@/features/repairs-access/order-number-reconciliation";

const LEGACY_SOURCE = "service_export_excel";

describe("repair order number reconciliation", () => {
  it("formats and parses the public repair number", () => {
    expect(formatRepairOrderNumber(1)).toBe("REP-000001");
    expect(formatRepairOrderNumber(388)).toBe("REP-000388");
    expect(parseRepairOrderNumber("REP-000649")).toBe(649);
  });

  it("keeps current-system orders and restores the requested historical anchors", () => {
    const orders = [
      {
        id: "legacy-1",
        repairNumber: "REP-000386",
        legacyOrderNumber: "1",
        importSource: LEGACY_SOURCE,
        createdAt: "2024-12-31T03:00:00.000Z"
      },
      {
        id: "legacy-198",
        repairNumber: "REP-000583",
        legacyOrderNumber: "198",
        importSource: LEGACY_SOURCE,
        createdAt: "2026-04-20T03:00:00.000Z"
      },
      {
        id: "legacy-200",
        repairNumber: "REP-000584",
        legacyOrderNumber: "200",
        importSource: LEGACY_SOURCE,
        createdAt: "2026-04-21T03:00:00.000Z"
      },
      {
        id: "legacy-266",
        repairNumber: "REP-000646",
        legacyOrderNumber: "266",
        importSource: LEGACY_SOURCE,
        createdAt: "2026-06-04T03:00:00.000Z"
      },
      {
        id: "current-266",
        repairNumber: "REP-000266",
        legacyOrderNumber: null,
        importSource: null,
        createdAt: "2026-06-04T20:17:17.000Z"
      },
      {
        id: "current-385",
        repairNumber: "REP-000385",
        legacyOrderNumber: null,
        importSource: null,
        createdAt: "2026-07-25T14:23:28.000Z"
      },
      {
        id: "post-647",
        repairNumber: "REP-000647",
        legacyOrderNumber: null,
        importSource: null,
        createdAt: "2026-07-27T13:40:19.000Z"
      },
      {
        id: "post-648",
        repairNumber: "REP-000648",
        legacyOrderNumber: null,
        importSource: null,
        createdAt: "2026-07-27T14:12:12.000Z"
      }
    ];

    const plan = buildRepairOrderRenumberPlan(orders, {
      historicalMax: 265,
      currentSystemStart: 266,
      currentSystemEnd: 385,
      legacySource: LEGACY_SOURCE,
      knownLegacyGaps: [2, 4, 152, 158, 199]
    });

    expect(plan.byId["legacy-1"].newNumber).toBe(1);
    expect(plan.byId["legacy-198"].newNumber).toBe(198);
    expect(plan.byId["legacy-200"].newNumber).toBe(199);
    expect(plan.byId["legacy-266"].newNumber).toBe(265);
    expect(plan.byId["current-266"].newNumber).toBe(266);
    expect(plan.byId["current-385"].newNumber).toBe(385);
    expect(plan.byId["post-647"].newNumber).toBe(386);
    expect(plan.byId["post-648"].newNumber).toBe(387);
    expect(plan.closedLegacyGaps).toEqual([199]);
    expect(plan.nextNumber).toBe(388);
  });

  it("uses created_at and id as a stable order for post-import orders", () => {
    const plan = buildRepairOrderRenumberPlan(
      [
        {
          id: "current-266",
          repairNumber: "REP-000266",
          legacyOrderNumber: null,
          importSource: null,
          createdAt: "2026-06-04T20:17:17.000Z"
        },
        {
          id: "post-b",
          repairNumber: "REP-000648",
          legacyOrderNumber: null,
          importSource: null,
          createdAt: "2026-07-27T14:00:00.000Z"
        },
        {
          id: "post-a",
          repairNumber: "REP-000647",
          legacyOrderNumber: null,
          importSource: null,
          createdAt: "2026-07-27T14:00:00.000Z"
        }
      ],
      {
        historicalMax: 265,
        currentSystemStart: 266,
        currentSystemEnd: 385,
        legacySource: LEGACY_SOURCE,
        knownLegacyGaps: []
      }
    );

    expect(plan.byId["post-a"].newNumber).toBe(386);
    expect(plan.byId["post-b"].newNumber).toBe(387);
  });

  it("rejects duplicate legacy numbers before building a mapping", () => {
    expect(() =>
      buildRepairOrderRenumberPlan(
        [
          {
            id: "legacy-a",
            repairNumber: "REP-000386",
            legacyOrderNumber: "1",
            importSource: LEGACY_SOURCE,
            createdAt: "2025-01-01T00:00:00.000Z"
          },
          {
            id: "legacy-b",
            repairNumber: "REP-000387",
            legacyOrderNumber: "1",
            importSource: LEGACY_SOURCE,
            createdAt: "2025-01-02T00:00:00.000Z"
          }
        ],
        {
          historicalMax: 265,
          currentSystemStart: 266,
          currentSystemEnd: 385,
          legacySource: LEGACY_SOURCE,
          knownLegacyGaps: []
        }
      )
    ).toThrow("Numero historico repetido");
  });

  it("rejects orders whose origin cannot be determined safely", () => {
    expect(() =>
      buildRepairOrderRenumberPlan(
        [
          {
            id: "unknown",
            repairNumber: "REP-000500",
            legacyOrderNumber: null,
            importSource: "another_import",
            createdAt: "2026-07-01T00:00:00.000Z"
          }
        ],
        {
          historicalMax: 265,
          currentSystemStart: 266,
          currentSystemEnd: 385,
          legacySource: LEGACY_SOURCE,
          knownLegacyGaps: []
        }
      )
    ).toThrow("No se pudo determinar el origen");
  });
});
