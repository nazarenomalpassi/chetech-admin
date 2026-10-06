export type RepairOrderNumberSnapshot = {
  id: string;
  repairNumber: string;
  legacyOrderNumber: string | null;
  importSource: string | null;
  createdAt: string;
};

export type RepairOrderNumberPlanEntry = RepairOrderNumberSnapshot & {
  currentNumber: number;
  newNumber: number;
  origin: "legacy_import" | "current_system" | "post_import";
  reason:
    | "legacy_original_number"
    | "legacy_shift_after_gap"
    | "current_system_preserved"
    | "post_import_chronological";
};

export type RepairOrderNumberPlan = {
  entries: RepairOrderNumberPlanEntry[];
  byId: Record<string, RepairOrderNumberPlanEntry>;
  closedLegacyGaps: number[];
  nextNumber: number;
};

type RepairOrderNumberPlanOptions = {
  historicalMax: number;
  currentSystemStart: number;
  currentSystemEnd: number;
  legacySource: string;
  knownLegacyGaps: number[];
};

export function parseRepairOrderNumber(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(?:REP-)?(\d+)$/i);
  if (!match) {
    throw new Error(`Numero de orden invalido: ${String(value ?? "") || "(vacio)"}.`);
  }

  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Numero de orden fuera de rango: ${String(value)}.`);
  }
  return number;
}

export function formatRepairOrderNumber(orderNumber: number) {
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) {
    throw new Error("El numero de orden debe ser un entero positivo.");
  }
  return `REP-${String(orderNumber).padStart(6, "0")}`;
}

function comparePostImportOrders(
  left: RepairOrderNumberSnapshot,
  right: RepairOrderNumberSnapshot
) {
  const dateComparison = left.createdAt.localeCompare(right.createdAt);
  return dateComparison || left.id.localeCompare(right.id);
}

export function buildRepairOrderRenumberPlan(
  orders: RepairOrderNumberSnapshot[],
  options: RepairOrderNumberPlanOptions
): RepairOrderNumberPlan {
  const snapshots = orders.map((order) => ({
    ...order,
    currentNumber: parseRepairOrderNumber(order.repairNumber)
  }));
  const legacyOrders = snapshots.filter(
    (order) => order.importSource === options.legacySource
  );
  const currentOrders = snapshots.filter(
    (order) =>
      !order.importSource &&
      order.currentNumber >= options.currentSystemStart &&
      order.currentNumber <= options.currentSystemEnd
  );
  const postImportOrders = snapshots
    .filter(
      (order) => !order.importSource && order.currentNumber > options.currentSystemEnd
    )
    .sort(comparePostImportOrders);

  const classifiedIds = new Set([
    ...legacyOrders.map((order) => order.id),
    ...currentOrders.map((order) => order.id),
    ...postImportOrders.map((order) => order.id)
  ]);
  const unknown = snapshots.filter((order) => !classifiedIds.has(order.id));
  if (unknown.length) {
    throw new Error(
      `No se pudo determinar el origen de ${unknown.length} orden(es): ${unknown
        .map((order) => order.repairNumber)
        .join(", ")}.`
    );
  }

  const legacyByNumber = new Map<number, string>();
  const parsedLegacyOrders = legacyOrders.map((order) => {
    const legacyNumber = parseRepairOrderNumber(order.legacyOrderNumber);
    const previousId = legacyByNumber.get(legacyNumber);
    if (previousId) {
      throw new Error(
        `Numero historico repetido ${legacyNumber} en ${previousId} y ${order.id}.`
      );
    }
    legacyByNumber.set(legacyNumber, order.id);
    return { ...order, legacyNumber };
  });

  const maximumLegacyNumber = parsedLegacyOrders.reduce(
    (maximum, order) => Math.max(maximum, order.legacyNumber),
    0
  );
  const gapsToClose = Math.max(0, maximumLegacyNumber - options.historicalMax);
  const closedLegacyGaps = Array.from(
    new Set(
      options.knownLegacyGaps.filter(
        (gap) => Number.isSafeInteger(gap) && gap > 0 && gap < maximumLegacyNumber
      )
    )
  )
    .sort((left, right) => right - left)
    .slice(0, gapsToClose)
    .sort((left, right) => left - right);

  if (closedLegacyGaps.length !== gapsToClose) {
    throw new Error(
      `No hay suficientes huecos historicos comprobados para reducir el maximo ${maximumLegacyNumber} a ${options.historicalMax}.`
    );
  }

  const entries: RepairOrderNumberPlanEntry[] = [
    ...parsedLegacyOrders.map((order) => {
      const appliedGapCount = closedLegacyGaps.filter(
        (gap) => gap < order.legacyNumber
      ).length;
      return {
        ...order,
        newNumber: order.legacyNumber - appliedGapCount,
        origin: "legacy_import" as const,
        reason:
          appliedGapCount > 0
            ? ("legacy_shift_after_gap" as const)
            : ("legacy_original_number" as const)
      };
    }),
    ...currentOrders.map((order) => ({
      ...order,
      newNumber: order.currentNumber,
      origin: "current_system" as const,
      reason: "current_system_preserved" as const
    })),
    ...postImportOrders.map((order, index) => ({
      ...order,
      newNumber: options.currentSystemEnd + index + 1,
      origin: "post_import" as const,
      reason: "post_import_chronological" as const
    }))
  ];

  const targetNumbers = new Map<number, string>();
  for (const entry of entries) {
    if (entry.newNumber <= 0 || !Number.isSafeInteger(entry.newNumber)) {
      throw new Error(`Numero final invalido para la orden ${entry.id}.`);
    }
    const previousId = targetNumbers.get(entry.newNumber);
    if (previousId) {
      throw new Error(
        `El numero final ${entry.newNumber} se asignaria a ${previousId} y ${entry.id}.`
      );
    }
    targetNumbers.set(entry.newNumber, entry.id);
  }

  const maximumNumber = entries.reduce(
    (maximum, entry) => Math.max(maximum, entry.newNumber),
    0
  );

  return {
    entries,
    byId: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
    closedLegacyGaps,
    nextNumber: maximumNumber + 1
  };
}
