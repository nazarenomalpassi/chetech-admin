import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?(?:Z|[+-]00:00)$/;
export const OPERATIONAL_TIME_ZONE = "America/Argentina/Cordoba";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value || 0);
}

export function toDisplayDate(value: string | Date) {
  if (value instanceof Date) return value;

  const dateOnlyMatch = value.match(DATE_ONLY_PATTERN) ?? value.match(UTC_MIDNIGHT_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  }

  return new Date(value);
}

export function formatDate(value: string | Date) {
  const date = toDisplayDate(value);
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeZone: OPERATIONAL_TIME_ZONE
  }).format(date);
}

export function getLocalDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
}

export function toOperationalDateTime(value: string) {
  const dateOnlyMatch = value.match(DATE_ONLY_PATTERN);
  if (!dateOnlyMatch) return value;

  return `${value}T00:00:00-03:00`;
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return 0;
}
