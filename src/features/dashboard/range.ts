const ARGENTINA_UTC_OFFSET_HOURS = 3;

function toDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function toArgentinaStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, ARGENTINA_UTC_OFFSET_HOURS, 0, 0));
}

export function getDashboardRange(from?: string, to?: string) {
  const now = new Date();
  const today = toDateString(now);
  let fromDate = from || today;
  let toDate = to || today;

  if (fromDate > toDate) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  const start = toArgentinaStart(fromDate);
  const end = toArgentinaStart(toDate);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    from: fromDate,
    to: toDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    isCustomRange: Boolean(from || to) && !(fromDate === today && toDate === today)
  };
}
