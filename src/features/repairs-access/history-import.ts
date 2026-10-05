import { normalizeRepairAccessLookup } from "@/features/repairs-access/customer-search";
import { calculateWarrantyDates } from "@/features/repairs-access/warranty";

export type HistoricalRow = Record<string, unknown>;

export type HistoricalCustomerIdentity = {
  fullName: string;
  fullNameNormalized: string;
  phoneNormalized: string | null;
  dni: string | null;
  addressNormalized: string | null;
};

export type ExistingHistoricalCustomer = {
  id: string;
  fullNameNormalized: string;
  phoneNormalized: string | null;
  alternatePhoneNormalized: string | null;
  dni: string | null;
  addressNormalized: string | null;
};

export type HistoricalCustomerMatch =
  | { kind: "existing"; customerId: string; reason: "phone_and_name" | "strong_identity" | "unique_exact_name" }
  | { kind: "ambiguous"; candidateIds: string[]; reason: "shared_phone_incompatible_identity" | "multiple_identity_matches" }
  | { kind: "new"; reason: "no_safe_match" };

export type NormalizedHistoricalRepairRow = {
  rowNumber: number;
  stableKey: string;
  legacyOrderNumber: string;
  customer: {
    fullName: string;
    fullNameNormalized: string;
    phone: string | null;
    phoneNormalized: string | null;
    alternatePhone: string | null;
    alternatePhoneNormalized: string | null;
    fixedPhone: string | null;
    dni: string | null;
    email: string | null;
    address: string | null;
    addressNormalized: string | null;
    notes: string | null;
  };
  device: {
    deviceType: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    accessoryDetails: string | null;
    visualCondition: string | null;
    notes: string | null;
  };
  order: {
    intakeDate: string;
    issueReported: string;
    status: ReturnType<typeof mapHistoricalRepairStatus>;
    technicianName: string | null;
    budgetAmount: number | null;
    finalAmount: number | null;
    budgetDetail: string | null;
    budgetedAt: string | null;
    finishedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    workPerformed: string | null;
    notes: string | null;
    internalObservations: string | null;
    hasWarranty: boolean;
    warrantyDays: number;
    warrantyStart: string | null;
    warrantyUntil: string | null;
    warrantyConditions: string | null;
    warrantyRequiresReview: boolean;
    historicalWarrantyExpired: boolean | null;
  };
  reviewReasons: string[];
};

export type ExistingHistoricalOrder = {
  id: string;
  stableKey: string | null;
  legacyOrderNumber: string | null;
};

export type PlannedHistoricalCustomer = {
  key: string;
  existingId: string | null;
  data: NormalizedHistoricalRepairRow["customer"];
  rowNumbers: number[];
  matchReason: HistoricalCustomerMatch["reason"];
};

export type RepairHistoryImportPlan = {
  customers: PlannedHistoricalCustomer[];
  orders: Array<{
    row: NormalizedHistoricalRepairRow;
    customerKey: string;
    matchKind: "existing" | "planned_new";
    matchReason: HistoricalCustomerMatch["reason"];
  }>;
  skippedOrders: Array<{
    rowNumber: number;
    legacyOrderNumber: string;
    stableKey: string;
    existingOrderId: string;
  }>;
  ambiguousRows: Array<{
    rowNumber: number;
    legacyOrderNumber: string;
    fullName: string;
    candidateIds: string[];
    reason: string;
  }>;
  summary: {
    ordersNew: number;
    ordersSkipped: number;
    customersNew: number;
    customersLinkedExisting: number;
    ordersLinkedExisting: number;
    ordersLinkedPlanned: number;
    ambiguousMatches: number;
  };
};

export function normalizeHistoricalHeader(value: unknown) {
  return normalizeRepairAccessLookup(String(value ?? ""));
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function getHistoricalRowValues(row: HistoricalRow, header: string) {
  const normalizedHeader = normalizeHistoricalHeader(header);
  return Object.entries(row)
    .filter(([key]) => normalizeHistoricalHeader(key) === normalizedHeader)
    .map(([, value]) => value);
}

export function getHistoricalRowValue(row: HistoricalRow, header: string) {
  const values = getHistoricalRowValues(row, header);
  return values.find(hasValue) ?? values[0] ?? null;
}

export function normalizeHistoricalText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function nullableHistoricalText(value: unknown) {
  const normalized = normalizeHistoricalText(value);
  return normalized || null;
}

export function normalizeHistoricalPhone(value: unknown) {
  let digits = normalizeHistoricalText(value).replace(/\D+/g, "");
  if (!digits || /^0+$/.test(digits)) return null;

  if (digits.startsWith("0054")) digits = digits.slice(4);
  if (digits.startsWith("54") && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith("9") && digits.length === 11) digits = digits.slice(1);
  digits = digits.replace(/^0+/, "");

  if (digits.length === 12) {
    for (let areaLength = 2; areaLength <= 4; areaLength += 1) {
      if (digits.slice(areaLength, areaLength + 2) === "15") {
        digits = `${digits.slice(0, areaLength)}${digits.slice(areaLength + 2)}`;
        break;
      }
    }
  }

  if (/^0+$/.test(digits) || digits.length < 6 || digits.length > 11) return null;
  return digits;
}

export function historicalBoolean(value: unknown) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const normalized = normalizeRepairAccessLookup(String(value));
  return ["1", "-1", "si", "s", "true", "yes"].includes(normalized);
}

export function historicalDateOnly(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 20_000 && value < 100_000) {
    const excelEpoch = Date.UTC(1899, 11, 30, 12);
    return new Date(excelEpoch + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }

  const text = normalizeHistoricalText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function historicalNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function joinHistoricalParts(parts: Array<string | null>, separator = ", ") {
  const values = Array.from(new Set(parts.filter((part): part is string => Boolean(part))));
  return values.length ? values.join(separator) : null;
}

function buildHistoricalAddress(row: HistoricalRow) {
  const street = nullableHistoricalText(getHistoricalRowValue(row, "direccion cliente"));
  const streetNumber = nullableHistoricalText(getHistoricalRowValue(row, "direccion numero cliente"));
  const streetLine = joinHistoricalParts([street, streetNumber], " ");
  const floor = nullableHistoricalText(getHistoricalRowValue(row, "direccion piso cliente"));
  const apartment = nullableHistoricalText(getHistoricalRowValue(row, "direccion departamento cliente"));
  const houseOrApartment = nullableHistoricalText(getHistoricalRowValue(row, "casadepartamento"));
  const location = [
    streetLine,
    floor ? `Piso ${floor}` : null,
    apartment ? `Depto ${apartment}` : null,
    houseOrApartment,
    nullableHistoricalText(getHistoricalRowValue(row, "barrio")),
    nullableHistoricalText(getHistoricalRowValue(row, "localidad")),
    nullableHistoricalText(getHistoricalRowValue(row, "provincia"))
  ];
  return joinHistoricalParts(location);
}

function buildHistoricalCustomerNotes(row: HistoricalRow) {
  const iva = nullableHistoricalText(getHistoricalRowValue(row, "iva"));
  const cuit = nullableHistoricalText(getHistoricalRowValue(row, "cuit"));
  return joinHistoricalParts([
    iva ? `IVA: ${iva}` : null,
    cuit && cuit !== "--" ? `CUIT: ${cuit}` : null
  ], " | ");
}

function buildHistoricalInternalObservations(row: HistoricalRow) {
  const writtenOffAt = historicalDateOnly(getHistoricalRowValue(row, "fechadebaja"));
  const writtenOffReason = nullableHistoricalText(getHistoricalRowValue(row, "causadebaja"));
  return joinHistoricalParts([
    nullableHistoricalText(getHistoricalRowValue(row, "observacionesusointerno")),
    writtenOffAt ? `Baja historica: ${writtenOffAt}` : null,
    writtenOffReason ? `Causa de baja: ${writtenOffReason}` : null
  ], "\n");
}

export function normalizeHistoricalRepairRow(
  row: HistoricalRow,
  rowNumber: number
): NormalizedHistoricalRepairRow {
  const legacyOrderNumber = normalizeHistoricalText(getHistoricalRowValue(row, "numero de orden"));
  if (!legacyOrderNumber) throw new Error(`Fila ${rowNumber}: falta el numero de orden.`);

  const reviewReasons: string[] = [];
  const importedName = nullableHistoricalText(getHistoricalRowValue(row, "nombre cliente"));
  const fullName = importedName ?? `Cliente sin identificar - orden ${legacyOrderNumber}`;
  if (!importedName) reviewReasons.push("cliente_sin_nombre");

  const primaryPhone = nullableHistoricalText(getHistoricalRowValue(row, "telefono celular"));
  const secondaryPhone = nullableHistoricalText(getHistoricalRowValue(row, "telefono celular 2"));
  const fixedPhone = nullableHistoricalText(getHistoricalRowValue(row, "telefono fijo"));
  const primaryPhoneNormalized = normalizeHistoricalPhone(primaryPhone);
  const secondaryPhoneNormalized = normalizeHistoricalPhone(secondaryPhone);
  const fixedPhoneNormalized = normalizeHistoricalPhone(fixedPhone);
  const alternatePhone = secondaryPhoneNormalized ? secondaryPhone : fixedPhoneNormalized ? fixedPhone : null;
  const alternatePhoneNormalized = secondaryPhoneNormalized ?? fixedPhoneNormalized;
  const address = buildHistoricalAddress(row);

  const importedDeviceType = nullableHistoricalText(getHistoricalRowValue(row, "equipo"));
  const deviceType = importedDeviceType ?? "Equipo sin especificar";
  if (!importedDeviceType) reviewReasons.push("equipo_sin_tipo");

  const importedIssue = nullableHistoricalText(getHistoricalRowValue(row, "defecto"));
  const issueReported = importedIssue ?? "Falla historica sin detalle";
  if (!importedIssue) reviewReasons.push("falla_sin_detalle");

  const intakeDate = historicalDateOnly(getHistoricalRowValue(row, "fecha de ingreso"));
  if (!intakeDate) throw new Error(`Fila ${rowNumber}: la fecha de ingreso no es valida.`);

  const pickedUp = historicalBoolean(getHistoricalRowValue(row, "retiro si no"));
  const repaired = historicalBoolean(getHistoricalRowValue(row, "reparacion realizada"));
  const budgeted = historicalBoolean(getHistoricalRowValue(row, "presupuestado"));
  const writtenOff = historicalBoolean(getHistoricalRowValue(row, "dadodebaja"));
  const pickedUpAt = historicalDateOnly(getHistoricalRowValue(row, "fecha de retiro"));
  if (pickedUp && !pickedUpAt) reviewReasons.push("retirada_sin_fecha");
  if (!pickedUp && pickedUpAt) reviewReasons.push("fecha_retiro_sin_marca");
  if (pickedUp && writtenOff) reviewReasons.push("retirada_y_dada_de_baja");

  const rawWarrantyDays = historicalNumber(getHistoricalRowValue(row, "garantiatiempodefalla"));
  const historicalWarrantyUntil = historicalDateOnly(getHistoricalRowValue(row, "garantia hasta"));
  let warrantyDays = Number.isInteger(rawWarrantyDays) && Number(rawWarrantyDays) >= 0
    ? Number(rawWarrantyDays)
    : 0;

  if (!warrantyDays && pickedUpAt && historicalWarrantyUntil && rawWarrantyDays === null) {
    const start = new Date(`${pickedUpAt}T12:00:00.000Z`);
    const end = new Date(`${historicalWarrantyUntil}T12:00:00.000Z`);
    warrantyDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }

  const hasWarranty = warrantyDays > 0;
  let warrantyStart: string | null = null;
  let warrantyUntil: string | null = null;
  let warrantyRequiresReview = pickedUp && !pickedUpAt;

  if (hasWarranty && pickedUpAt) {
    const calculated = calculateWarrantyDates(pickedUpAt, warrantyDays);
    warrantyStart = calculated.startsOn;
    warrantyUntil = historicalWarrantyUntil ?? calculated.expiresOn;
    if (historicalWarrantyUntil && historicalWarrantyUntil !== calculated.expiresOn) {
      reviewReasons.push("vencimiento_inconsistente");
      warrantyRequiresReview = true;
    }
  }

  const status = mapHistoricalRepairStatus({ pickedUp, repaired, budgeted, writtenOff });
  const color = nullableHistoricalText(getHistoricalRowValue(row, "color"));
  const warrantyConditions = nullableHistoricalText(getHistoricalRowValue(row, "garantia"));

  return {
    rowNumber,
    stableKey: `service_export:${legacyOrderNumber}`,
    legacyOrderNumber,
    customer: {
      fullName,
      fullNameNormalized: normalizeRepairAccessLookup(fullName),
      phone: primaryPhoneNormalized ? primaryPhone : null,
      phoneNormalized: primaryPhoneNormalized,
      alternatePhone,
      alternatePhoneNormalized,
      fixedPhone: fixedPhoneNormalized ? fixedPhone : null,
      dni: nullableHistoricalText(getHistoricalRowValue(row, "dni")),
      email: nullableHistoricalText(getHistoricalRowValue(row, "email")),
      address,
      addressNormalized: address ? normalizeRepairAccessLookup(address) : null,
      notes: buildHistoricalCustomerNotes(row)
    },
    device: {
      deviceType,
      brand: nullableHistoricalText(getHistoricalRowValue(row, "marca")),
      model: nullableHistoricalText(getHistoricalRowValue(row, "modelo")),
      serialNumber: nullableHistoricalText(getHistoricalRowValue(row, "numero de serie")),
      accessoryDetails: nullableHistoricalText(getHistoricalRowValue(row, "accesorios")),
      visualCondition: color ? `Color: ${color}` : null,
      notes: null
    },
    order: {
      intakeDate,
      issueReported,
      status,
      technicianName: nullableHistoricalText(getHistoricalRowValue(row, "tecnico")),
      budgetAmount: historicalNumber(getHistoricalRowValue(row, "costo reparacion")),
      finalAmount: historicalNumber(getHistoricalRowValue(row, "costo reparacion")),
      budgetDetail: nullableHistoricalText(getHistoricalRowValue(row, "detalle presupuesto")),
      budgetedAt: historicalDateOnly(getHistoricalRowValue(row, "fecha presupuesto")),
      finishedAt: historicalDateOnly(getHistoricalRowValue(row, "fecha reparado")),
      pickedUpAt: pickedUpAt,
      deliveredAt: pickedUpAt,
      workPerformed: nullableHistoricalText(getHistoricalRowValue(row, "trabajo realizado")),
      notes: nullableHistoricalText(getHistoricalRowValue(row, "observaciones")),
      internalObservations: buildHistoricalInternalObservations(row),
      hasWarranty,
      warrantyDays,
      warrantyStart,
      warrantyUntil,
      warrantyConditions,
      warrantyRequiresReview,
      historicalWarrantyExpired: hasValue(getHistoricalRowValue(row, "garantiavencida"))
        ? historicalBoolean(getHistoricalRowValue(row, "garantiavencida"))
        : null
    },
    reviewReasons
  };
}

export function mapHistoricalRepairStatus({
  pickedUp,
  repaired,
  budgeted,
  writtenOff
}: {
  pickedUp: boolean;
  repaired: boolean;
  budgeted: boolean;
  writtenOff: boolean;
}) {
  if (pickedUp) return "retirado" as const;
  if (writtenOff) return "sin_solucion" as const;
  if (repaired) return "listo_para_retirar" as const;
  if (budgeted) return "presupuestado" as const;
  return "pendiente_revision" as const;
}

function sameNullableValue(left: string | null, right: string | null) {
  return Boolean(left && right && normalizeRepairAccessLookup(left) === normalizeRepairAccessLookup(right));
}

function hasStrongIdentityMatch(identity: HistoricalCustomerIdentity, candidate: ExistingHistoricalCustomer) {
  return sameNullableValue(identity.dni, candidate.dni) || sameNullableValue(identity.addressNormalized, candidate.addressNormalized);
}

export function classifyHistoricalCustomerMatch(
  identity: HistoricalCustomerIdentity,
  candidates: ExistingHistoricalCustomer[]
): HistoricalCustomerMatch {
  const phoneMatches = identity.phoneNormalized
    ? candidates.filter(
        (candidate) =>
          candidate.phoneNormalized === identity.phoneNormalized ||
          candidate.alternatePhoneNormalized === identity.phoneNormalized
      )
    : [];

  if (phoneMatches.length) {
    const compatible = phoneMatches.filter(
      (candidate) =>
        candidate.fullNameNormalized === identity.fullNameNormalized ||
        hasStrongIdentityMatch(identity, candidate)
    );

    if (compatible.length === 1) {
      return {
        kind: "existing",
        customerId: compatible[0].id,
        reason: compatible[0].fullNameNormalized === identity.fullNameNormalized ? "phone_and_name" : "strong_identity"
      };
    }

    return {
      kind: "ambiguous",
      candidateIds: phoneMatches.map((candidate) => candidate.id).sort(),
      reason: compatible.length > 1 ? "multiple_identity_matches" : "shared_phone_incompatible_identity"
    };
  }

  const exactNameMatches = candidates.filter(
    (candidate) =>
      identity.fullNameNormalized &&
      candidate.fullNameNormalized === identity.fullNameNormalized
  );
  const strongMatches = exactNameMatches.filter((candidate) => hasStrongIdentityMatch(identity, candidate));

  if (strongMatches.length === 1) {
    return { kind: "existing", customerId: strongMatches[0].id, reason: "strong_identity" };
  }
  if (strongMatches.length > 1 || exactNameMatches.length > 1) {
    return {
      kind: "ambiguous",
      candidateIds: (strongMatches.length ? strongMatches : exactNameMatches).map((candidate) => candidate.id).sort(),
      reason: "multiple_identity_matches"
    };
  }
  if (exactNameMatches.length === 1) {
    return { kind: "existing", customerId: exactNameMatches[0].id, reason: "unique_exact_name" };
  }

  return { kind: "new", reason: "no_safe_match" };
}

function stableIdentityHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function getPlannedCustomerKey(identity: HistoricalCustomerIdentity) {
  const source = [
    identity.fullNameNormalized,
    identity.phoneNormalized ?? "",
    identity.dni ? normalizeRepairAccessLookup(identity.dni) : "",
    identity.addressNormalized ?? ""
  ].join("|");
  return `planned:${stableIdentityHash(source)}`;
}

function mergeHistoricalCustomerData(
  current: NormalizedHistoricalRepairRow["customer"],
  incoming: NormalizedHistoricalRepairRow["customer"]
) {
  return {
    fullName: current.fullName || incoming.fullName,
    fullNameNormalized: current.fullNameNormalized || incoming.fullNameNormalized,
    phone: current.phone ?? incoming.phone,
    phoneNormalized: current.phoneNormalized ?? incoming.phoneNormalized,
    alternatePhone: current.alternatePhone ?? incoming.alternatePhone,
    alternatePhoneNormalized: current.alternatePhoneNormalized ?? incoming.alternatePhoneNormalized,
    fixedPhone: current.fixedPhone ?? incoming.fixedPhone,
    dni: current.dni ?? incoming.dni,
    email: current.email ?? incoming.email,
    address: current.address ?? incoming.address,
    addressNormalized: current.addressNormalized ?? incoming.addressNormalized,
    notes: joinHistoricalParts([current.notes, incoming.notes], " | ")
  };
}

export function validateHistoricalOrderNumbers(
  rows: Array<{ rowNumber: number; legacyOrderNumber: string }>
) {
  const seen = new Map<number, number>();

  for (const row of rows) {
    const text = String(row.legacyOrderNumber ?? "").trim();
    const number = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (!Number.isSafeInteger(number) || number <= 0 || number > 999_999) {
      throw new Error(
        `Numero historico invalido en fila ${row.rowNumber}: "${text || "(vacio)"}".`
      );
    }

    const previousRow = seen.get(number);
    if (previousRow) {
      throw new Error(
        `Numero historico repetido ${number} en las filas ${previousRow} y ${row.rowNumber}.`
      );
    }
    seen.set(number, row.rowNumber);
  }
}

export function buildHistoricalPublicOrderNumberPlan(
  rows: Array<{ rowNumber: number; legacyOrderNumber: string }>,
  options: { maximumPublicOrderNumber: number }
) {
  validateHistoricalOrderNumbers(rows);

  if (
    !Number.isSafeInteger(options.maximumPublicOrderNumber) ||
    options.maximumPublicOrderNumber <= 0
  ) {
    throw new Error("El maximo publico historico debe ser un entero positivo.");
  }

  const legacyNumbers = rows.map((row) => Number(row.legacyOrderNumber));
  const maximumLegacyNumber = Math.max(...legacyNumbers, 0);
  const gapsToClose = Math.max(
    0,
    maximumLegacyNumber - options.maximumPublicOrderNumber
  );
  const legacyNumberSet = new Set(legacyNumbers);
  const closedLegacyGaps = Array.from(
    { length: maximumLegacyNumber },
    (_, index) => index + 1
  )
    .filter((number) => !legacyNumberSet.has(number))
    .sort((left, right) => right - left)
    .slice(0, gapsToClose)
    .sort((left, right) => left - right);

  if (closedLegacyGaps.length !== gapsToClose) {
    throw new Error(
      `No hay suficientes huecos historicos comprobados para reducir el maximo ${maximumLegacyNumber} a ${options.maximumPublicOrderNumber}.`
    );
  }

  const byLegacyOrderNumber = Object.fromEntries(
    legacyNumbers.map((legacyNumber) => [
      String(legacyNumber),
      legacyNumber -
        closedLegacyGaps.filter((gap) => gap < legacyNumber).length
    ])
  );
  const publicNumbers = Object.values(byLegacyOrderNumber);

  if (
    publicNumbers.some(
      (number) =>
        !Number.isSafeInteger(number) ||
        number <= 0 ||
        number > options.maximumPublicOrderNumber
    ) ||
    new Set(publicNumbers).size !== publicNumbers.length
  ) {
    throw new Error(
      "La numeracion historica reconciliada contiene valores invalidos o repetidos."
    );
  }

  return {
    byLegacyOrderNumber,
    closedLegacyGaps,
    maximumPublicOrderNumber: Math.max(...publicNumbers, 0)
  };
}

export function buildRepairHistoryImportPlan({
  rows,
  existingCustomers,
  existingOrders
}: {
  rows: NormalizedHistoricalRepairRow[];
  existingCustomers: ExistingHistoricalCustomer[];
  existingOrders: ExistingHistoricalOrder[];
}): RepairHistoryImportPlan {
  validateHistoricalOrderNumbers(rows);

  const existingByStableKey = new Map(
    existingOrders
      .filter((order) => order.stableKey)
      .map((order) => [order.stableKey as string, order])
  );
  const existingByLegacyNumber = new Map(
    existingOrders
      .filter((order) => order.legacyOrderNumber)
      .map((order) => [order.legacyOrderNumber as string, order])
  );
  const candidates = [...existingCustomers];
  const customerPlans = new Map<string, PlannedHistoricalCustomer>();
  const orders: RepairHistoryImportPlan["orders"] = [];
  const skippedOrders: RepairHistoryImportPlan["skippedOrders"] = [];
  const ambiguousRows: RepairHistoryImportPlan["ambiguousRows"] = [];
  let ordersLinkedExisting = 0;
  let ordersLinkedPlanned = 0;

  for (const row of rows) {
    const existingOrder =
      existingByStableKey.get(row.stableKey) ??
      existingByLegacyNumber.get(row.legacyOrderNumber);

    if (existingOrder) {
      skippedOrders.push({
        rowNumber: row.rowNumber,
        legacyOrderNumber: row.legacyOrderNumber,
        stableKey: row.stableKey,
        existingOrderId: existingOrder.id
      });
      continue;
    }

    const identity: HistoricalCustomerIdentity = {
      fullName: row.customer.fullName,
      fullNameNormalized: row.customer.fullNameNormalized,
      phoneNormalized: row.customer.phoneNormalized,
      dni: row.customer.dni,
      addressNormalized: row.customer.addressNormalized
    };
    const match = classifyHistoricalCustomerMatch(identity, candidates);
    let customerKey: string;
    let matchKind: "existing" | "planned_new";
    let matchReason: HistoricalCustomerMatch["reason"];

    if (match.kind === "existing") {
      customerKey = match.customerId.startsWith("planned:")
        ? match.customerId
        : `existing:${match.customerId}`;
      matchKind = match.customerId.startsWith("planned:") ? "planned_new" : "existing";
      matchReason = match.reason;
      if (matchKind === "existing") ordersLinkedExisting += 1;
      else ordersLinkedPlanned += 1;
    } else {
      customerKey = getPlannedCustomerKey(identity);
      matchKind = "planned_new";
      matchReason = match.reason;
      ordersLinkedPlanned += 1;

      if (match.kind === "ambiguous") {
        ambiguousRows.push({
          rowNumber: row.rowNumber,
          legacyOrderNumber: row.legacyOrderNumber,
          fullName: row.customer.fullName,
          candidateIds: match.candidateIds,
          reason: match.reason
        });
      }
    }

    const existingPlan = customerPlans.get(customerKey);
    if (existingPlan) {
      existingPlan.data = mergeHistoricalCustomerData(existingPlan.data, row.customer);
      existingPlan.rowNumbers.push(row.rowNumber);
    } else {
      const existingId = customerKey.startsWith("existing:")
        ? customerKey.slice("existing:".length)
        : null;
      customerPlans.set(customerKey, {
        key: customerKey,
        existingId,
        data: { ...row.customer },
        rowNumbers: [row.rowNumber],
        matchReason
      });

      if (!existingId) {
        candidates.push({
          id: customerKey,
          fullNameNormalized: row.customer.fullNameNormalized,
          phoneNormalized: row.customer.phoneNormalized,
          alternatePhoneNormalized: row.customer.alternatePhoneNormalized,
          dni: row.customer.dni,
          addressNormalized: row.customer.addressNormalized
        });
      }
    }

    orders.push({ row, customerKey, matchKind, matchReason });
  }

  const customers = Array.from(customerPlans.values());
  return {
    customers,
    orders,
    skippedOrders,
    ambiguousRows,
    summary: {
      ordersNew: orders.length,
      ordersSkipped: skippedOrders.length,
      customersNew: customers.filter((customer) => !customer.existingId).length,
      customersLinkedExisting: customers.filter((customer) => customer.existingId).length,
      ordersLinkedExisting,
      ordersLinkedPlanned,
      ambiguousMatches: ambiguousRows.length
    }
  };
}
