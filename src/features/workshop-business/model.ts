import { z } from "zod";
import { getLocalDateInputValue } from "@/lib/utils";

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getWorkshopCohort(from?: string, to?: string, now = new Date()) {
  const today = getLocalDateInputValue(now);
  const start = from || `${today.slice(0, 7)}-01`;
  const end = to || today;
  if (!isCalendarDate(start) || !isCalendarDate(end)) throw new Error("La fecha de ingreso no es valida.");
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

const count = z.number().int().nonnegative();
const amount = z.number().finite();
const nullableAmount = amount.nullable();
export const workshopBusinessReportSchema = z.object({
  from: z.string(), to: z.string(), asOf: z.string(), snapshotAt: z.string(),
  totals: z.object({
    orders: count, activeCustody: count, acceptedCurrent: count, rejectedCurrent: count,
    staleAcceptanceOrders: count, acceptanceRate: nullableAmount,
    collected: amount, knownChargeSubtotal: amount, knownDebtSubtotal: amount, debt: nullableAmount,
    knownCreditSubtotal: amount, unknownChargeOrders: count, paidFlagWithoutPaymentsOrders: count,
    consumedPartsQuantity: amount, consumedPartsCostKnown: amount, thirdPartyCostKnown: amount,
    knownDirectCostSubtotal: amount, unknownCostOrders: count, directCost: nullableAmount,
    directMargin: nullableAmount, knownDirectMarginSubtotal: nullableAmount,
    linkedPurchasePayments: amount, unclassifiedRepExpenses: amount,
    warrantyOrders: count, activeWarrantyOrders: count, warrantyReviewOrders: count,
    intakeAgeMedianDays: nullableAmount, intakeAgeP90Days: nullableAmount, futureIntakeOrders: count
  }),
  categories: z.object({ unassigned: count, waiting_customer: count, parts: count, ready: count, return: count }),
  technicians: z.array(z.object({
    technicianId: z.string().nullable(), technicianName: z.string(), orders: count, activeCustody: count,
    creatorDifferentOrders: count, acceptedCurrent: count, collected: amount, knownDebtSubtotal: amount,
    unknownCostOrders: count, directCost: nullableAmount, knownDirectCostSubtotal: amount,
    knownDirectMarginSubtotal: nullableAmount, intakeAgeMedianDays: nullableAmount, intakeAgeP90Days: nullableAmount
  }))
});

export type WorkshopBusinessReport = z.infer<typeof workshopBusinessReportSchema>;
export type WorkshopCategory = keyof WorkshopBusinessReport["categories"];
export function workshopCategoryHref(category: WorkshopCategory) {
  return `/reparaciones-access?view=ordenes&scope=${category}` as const;
}

export type WorkshopBusinessReportResult = {
  range: { from: string; to: string };
  report: WorkshopBusinessReport | null;
  migrationReady: boolean;
};
