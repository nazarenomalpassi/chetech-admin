import type { WorkshopBusinessReport } from "./model";

export const reportFixture: WorkshopBusinessReport = {
  from: "2026-10-01", to: "2026-10-05", asOf: "2026-10-05", snapshotAt: "2026-10-05T15:00:00Z",
  totals: {
    orders: 4, activeCustody: 3, acceptedCurrent: 1, rejectedCurrent: 1, staleAcceptanceOrders: 1,
    acceptanceRate: 50, collected: 520, knownChargeSubtotal: 1800, knownDebtSubtotal: 1300, debt: null,
    knownCreditSubtotal: 0, unknownChargeOrders: 1, paidFlagWithoutPaymentsOrders: 1,
    consumedPartsQuantity: 4, consumedPartsCostKnown: 200, thirdPartyCostKnown: 50,
    knownDirectCostSubtotal: 250, unknownCostOrders: 2, directCost: null, directMargin: null,
    knownDirectMarginSubtotal: 1050, linkedPurchasePayments: 1000, unclassifiedRepExpenses: 140,
    warrantyOrders: 1, activeWarrantyOrders: 1, warrantyReviewOrders: 0,
    intakeAgeMedianDays: 20, intakeAgeP90Days: 36, futureIntakeOrders: 0
  },
  categories: { unassigned: 1, waiting_customer: 0, parts: 2, ready: 0, return: 1 },
  technicians: [{
    technicianId: "tech-a", technicianName: "Tecnico A", orders: 2, activeCustody: 2, creatorDifferentOrders: 2,
    acceptedCurrent: 1, collected: 500, knownDebtSubtotal: 1000, unknownCostOrders: 1, directCost: null,
    knownDirectCostSubtotal: 250, knownDirectMarginSubtotal: 750, intakeAgeMedianDays: 15, intakeAgeP90Days: 19
  }]
};
