const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OPERATIONAL_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type RepairWarrantyStateCode =
  | "none"
  | "pending_delivery"
  | "active"
  | "expires_today"
  | "expired"
  | "needs_review";

export type RepairWarrantyState = {
  code: RepairWarrantyStateCode;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  startsOn: string | null;
  expiresOn: string | null;
  daysRemaining: number | null;
  daysElapsed: number | null;
  description: string;
};

type WarrantyStateInput = {
  hasWarranty: boolean;
  warrantyDays: number;
  pickedUpAt: string | null;
  repairStatus: string;
  warrantyStart?: string | null;
  warrantyUntil?: string | null;
  today?: string;
  requiresReview?: boolean;
};

function formatDateInOperationalTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toWarrantyDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = value.match(DATE_ONLY_PATTERN);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateInOperationalTimeZone(parsed);
}

function addCalendarDays(dateOnly: string, days: number) {
  const match = dateOnly.match(DATE_ONLY_PATTERN);
  if (!match) throw new Error("La fecha de retiro no es valida.");

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInCalendarDays(left: string, right: string) {
  const leftDate = new Date(`${left}T12:00:00.000Z`);
  const rightDate = new Date(`${right}T12:00:00.000Z`);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

export function getOperationalDate(date = new Date()) {
  return formatDateInOperationalTimeZone(date);
}

export function toWarrantyPickupTimestamp(dateOnly: string) {
  if (!DATE_ONLY_PATTERN.test(dateOnly)) {
    throw new Error("La fecha de retiro no es valida.");
  }

  return `${dateOnly}T00:00:00-03:00`;
}

export function calculateWarrantyDates(pickedUpAt: string, warrantyDays: number) {
  const startsOn = toWarrantyDateOnly(pickedUpAt);
  if (!startsOn) throw new Error("La fecha de retiro no es valida.");
  if (!Number.isInteger(warrantyDays) || warrantyDays <= 0) {
    throw new Error("La duracion de la garantia debe ser mayor a cero.");
  }

  return {
    startsOn,
    expiresOn: addCalendarDays(startsOn, warrantyDays)
  };
}

export function getWarrantyState(input: WarrantyStateInput): RepairWarrantyState {
  const pickedUpOn = toWarrantyDateOnly(input.pickedUpAt);
  const today = toWarrantyDateOnly(input.today ?? getOperationalDate()) ?? getOperationalDate();

  if (input.requiresReview || (input.repairStatus === "retirado" && !pickedUpOn)) {
    return {
      code: "needs_review",
      label: "Requiere revision",
      tone: "danger",
      startsOn: null,
      expiresOn: null,
      daysRemaining: null,
      daysElapsed: null,
      description: "La orden figura retirada, pero no tiene una fecha efectiva de retiro."
    };
  }

  if (!input.hasWarranty) {
    return {
      code: "none",
      label: "Sin garantia",
      tone: "neutral",
      startsOn: null,
      expiresOn: null,
      daysRemaining: null,
      daysElapsed: null,
      description: "Esta reparacion no tiene garantia asignada."
    };
  }

  if (!Number.isInteger(input.warrantyDays) || input.warrantyDays <= 0) {
    return {
      code: "needs_review",
      label: "Requiere revision",
      tone: "danger",
      startsOn: pickedUpOn,
      expiresOn: null,
      daysRemaining: null,
      daysElapsed: null,
      description: "La garantia esta marcada, pero no tiene una duracion valida."
    };
  }

  if (!pickedUpOn) {
    return {
      code: "pending_delivery",
      label: "Pendiente de entrega",
      tone: "info",
      startsOn: null,
      expiresOn: null,
      daysRemaining: null,
      daysElapsed: null,
      description: "La garantia comenzara cuando el cliente retire el equipo."
    };
  }

  const calculated = calculateWarrantyDates(pickedUpOn, input.warrantyDays);
  const storedStart = toWarrantyDateOnly(input.warrantyStart);
  const storedUntil = toWarrantyDateOnly(input.warrantyUntil);
  const hasInconsistentStoredDates =
    (storedStart !== null && storedStart !== calculated.startsOn) ||
    (storedUntil !== null && storedUntil !== calculated.expiresOn);

  if (hasInconsistentStoredDates) {
    return {
      code: "needs_review",
      label: "Requiere revision",
      tone: "danger",
      startsOn: calculated.startsOn,
      expiresOn: calculated.expiresOn,
      daysRemaining: null,
      daysElapsed: null,
      description: "Las fechas guardadas no coinciden con el retiro y la duracion asignada."
    };
  }

  const daysRemaining = differenceInCalendarDays(calculated.expiresOn, today);
  if (daysRemaining > 0) {
    return {
      code: "active",
      label: "Vigente",
      tone: "success",
      startsOn: calculated.startsOn,
      expiresOn: calculated.expiresOn,
      daysRemaining,
      daysElapsed: null,
      description: `Quedan ${daysRemaining} dias de garantia.`
    };
  }

  if (daysRemaining === 0) {
    return {
      code: "expires_today",
      label: "Vence hoy",
      tone: "warning",
      startsOn: calculated.startsOn,
      expiresOn: calculated.expiresOn,
      daysRemaining: 0,
      daysElapsed: 0,
      description: "La garantia vence hoy."
    };
  }

  return {
    code: "expired",
    label: "Vencida",
    tone: "danger",
    startsOn: calculated.startsOn,
    expiresOn: calculated.expiresOn,
    daysRemaining: 0,
    daysElapsed: Math.abs(daysRemaining),
    description: `Vencio hace ${Math.abs(daysRemaining)} dias.`
  };
}
