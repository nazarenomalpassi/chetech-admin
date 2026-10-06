function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(date);
}

function toMonthBoundary(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1, 3, 0, 0));
}

export function getMonthlyComparisonPeriods(referenceDate?: string) {
  const baseDate = referenceDate ? new Date(`${referenceDate}T12:00:00`) : new Date();
  const currentYear = baseDate.getFullYear();
  const currentMonthIndex = baseDate.getMonth();
  const previousDate = new Date(currentYear, currentMonthIndex - 1, 1, 12, 0, 0);

  const currentStart = toMonthBoundary(currentYear, currentMonthIndex);
  const currentEnd = toMonthBoundary(currentYear, currentMonthIndex + 1);
  const previousStart = toMonthBoundary(previousDate.getFullYear(), previousDate.getMonth());
  const previousEnd = toMonthBoundary(previousDate.getFullYear(), previousDate.getMonth() + 1);

  return {
    current: {
      label: toMonthLabel(new Date(currentYear, currentMonthIndex, 1, 12, 0, 0)),
      monthKey: `${currentYear}-${pad(currentMonthIndex + 1)}`,
      startIso: currentStart.toISOString(),
      endIso: currentEnd.toISOString(),
      dateStart: `${currentYear}-${pad(currentMonthIndex + 1)}-01`,
      dateEndExclusive: `${currentEnd.getUTCFullYear()}-${pad(currentEnd.getUTCMonth() + 1)}-01`
    },
    previous: {
      label: toMonthLabel(previousDate),
      monthKey: `${previousDate.getFullYear()}-${pad(previousDate.getMonth() + 1)}`,
      startIso: previousStart.toISOString(),
      endIso: previousEnd.toISOString(),
      dateStart: `${previousDate.getFullYear()}-${pad(previousDate.getMonth() + 1)}-01`,
      dateEndExclusive: `${previousEnd.getUTCFullYear()}-${pad(previousEnd.getUTCMonth() + 1)}-01`
    }
  };
}

export function calculateVariation(current: number, previous: number) {
  const difference = current - previous;
  const percentage = previous === 0 ? (current === 0 ? 0 : null) : (difference / previous) * 100;

  return {
    difference,
    percentage,
    trend: difference > 0 ? "up" : difference < 0 ? "down" : "flat"
  } as const;
}
