import { z } from "zod";
import { getOperationalDate } from "./warranty";

const dateOnly = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const days = z.number().finite().nonnegative().nullable();

export const workshopOperationalMetricsSchema = z.object({
  version: z.literal(1),
  scope: z.literal("full_workshop"),
  asOf: dateOnly,
  snapshotAt: z.string().datetime({ offset: true }),
  period: z.object({ from: dateOnly, to: dateOnly }),
  current: z.object({
    openOrders: count,
    waitingAuthorization: count,
    age: z.object({ days0to7: count, days8to14: count, days15to30: count, days31plus: count, unknownIntakeOrders: count }),
    inactivity: z.object({ thresholdDays: z.literal(7), staleOrders: count, knownActivityOrders: count, unknownActivityOrders: count }),
    parts: z.object({ orders: count, requests: count, unitsToPurchase: count, unitsInTransit: count, unitsToReceive: count }),
    ready: z.object({ orders: count, datedOrders: count, unknownDateOrders: count, medianWaitDays: days, oldestWaitDays: days })
  }),
  periodFlow: z.object({
    intakes: count, closures: count, closuresMissingDate: count,
    days: z.array(z.object({ date: dateOnly, intakes: count, closures: count }))
  }),
  warranty: z.object({
    activeReturns: count, openedInPeriod: count, closedInPeriod: count, uniqueOrdersInPeriod: count,
    matureCohort: z.object({
      maturedOrders: count, returnedOrders: count, comparableOrders: count.nullable(),
      returnRate: z.number().finite().min(0).max(100).nullable(), reason: z.string().nullable()
    })
  }),
  phaseDurations: z.array(z.object({ status: z.string(), samples: count, orders: count, medianDays: days })),
  quality: z.object({ reconstructedStatusEvents: count, ambiguousStatusEvents: count, invalidStatusIntervals: count }),
  methodology: z.object({ warrantyObservationFrom: dateOnly.nullable() })
}).superRefine((snapshot, context) => {
  const cohort = snapshot.warranty.matureCohort;
  const observed = snapshot.methodology.warrantyObservationFrom !== null;
  const expected = observed ? getComparableWarrantyRate(cohort) : null;
  if (cohort.returnedOrders > cohort.maturedOrders
    || (!observed && (cohort.comparableOrders !== null || cohort.returnRate !== null))
    || (observed && (cohort.comparableOrders === null || cohort.comparableOrders > cohort.maturedOrders || cohort.returnedOrders > cohort.comparableOrders))
    || (observed && cohort.comparableOrders !== null && cohort.comparableOrders < cohort.maturedOrders && !cohort.reason?.trim())
    || cohort.returnRate !== expected
    || (cohort.returnRate === null && !cohort.reason?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["warranty", "matureCohort"], message: "Cohorte sin observacion comparable o tasa inconsistente." });
  }
});

export type WorkshopOperationalMetricsSnapshot = z.infer<typeof workshopOperationalMetricsSchema>;
export type OperationalMetricsRange = { from: string; to: string };

export function getOperationalMetricsRange(params: Partial<OperationalMetricsRange> = {}, now = new Date()): OperationalMetricsRange {
  const today = getOperationalDate(now);
  const from = params.from ?? `${today.slice(0, 7)}-01`;
  const to = params.to ?? today;
  if (!dateOnly.safeParse(from).success || !dateOnly.safeParse(to).success || from > to
    || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 3660) {
    throw new Error("El periodo de metricas no es valido. Usa fechas reales y un rango de hasta 3661 dias.");
  }
  return { from, to };
}

// Reference formulas for SQL parity tests. The UI never aggregates a page of orders.
export function getOperationalAgeBucket(value: number | null) {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return null;
  if (value <= 7) return "days0to7";
  if (value <= 14) return "days8to14";
  if (value <= 30) return "days15to30";
  return "days31plus";
}

export function getRecordedMedianDays(values: (number | null)[]): number | null {
  const observed = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!observed.length) return null;
  const middle = Math.floor(observed.length / 2);
  return observed.length % 2 ? observed[middle] : (observed[middle - 1] + observed[middle]) / 2;
}

export function getComparableWarrantyRate({ returnedOrders, comparableOrders }: { returnedOrders: number; comparableOrders: number | null }): number | null {
  if (comparableOrders === null || !Number.isSafeInteger(comparableOrders) || comparableOrders <= 0
    || !Number.isSafeInteger(returnedOrders) || returnedOrders < 0 || returnedOrders > comparableOrders) return null;
  return Math.round(10000 * returnedOrders / comparableOrders) / 100;
}

export function isComparableWarrantyInterval({ startsOn, endsOn, observationFrom, asOf }: { startsOn: string; endsOn: string; observationFrom: string | null; asOf: string }): boolean {
  if (observationFrom === null || ![startsOn, endsOn, observationFrom, asOf].every((value) => dateOnly.safeParse(value).success)) return false;
  return startsOn >= observationFrom && endsOn >= startsOn && endsOn < asOf;
}
