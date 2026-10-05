import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

import {
  buildHistoricalPublicOrderNumberPlan,
  buildRepairHistoryImportPlan,
  getHistoricalRowValue,
  normalizeHistoricalHeader,
  normalizeHistoricalRepairRow,
  normalizeHistoricalText,
  type ExistingHistoricalCustomer,
  type ExistingHistoricalOrder,
  type HistoricalRow
} from "@/features/repairs-access/history-import";
import { getOperationalDate, getWarrantyState } from "@/features/repairs-access/warranty";

const DEFAULT_WORKBOOK_PATH = "C:\\Users\\nazar\\Downloads\\Service Exporado.xlsx";
const SOURCE = "service_export_excel";
const EXPECTED_ROWS = 261;
const APPLY_CONFIRMATION = `IMPORT-${EXPECTED_ROWS}`;

loadEnvConfig(process.cwd());

const workbookPath =
  process.argv.find((argument) => !argument.startsWith("--") && argument.toLowerCase().endsWith(".xlsx")) ??
  DEFAULT_WORKBOOK_PATH;
const applyMode = process.argv.includes("--apply");
const confirmation = process.argv.find((argument) => argument.startsWith("--confirm="))?.split("=")[1];
const rollbackBatchId = process.argv
  .find((argument) => argument.startsWith("--rollback="))
  ?.split("=")[1];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

type ExistingCustomerRow = {
  id: string;
  full_name: string;
  full_name_normalized: string | null;
  phone: string | null;
  phone_normalized: string | null;
  alternate_phone: string | null;
  alternate_phone_normalized: string | null;
  dni: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type CurrentOrderRow = {
  id: string;
  order_number: number;
  repair_number: string | null;
  import_source: string | null;
  intake_date: string;
  issue_reported: string;
  repair_access_customers:
    | { full_name: string; full_name_normalized: string | null; phone_normalized: string | null }
    | { full_name: string; full_name_normalized: string | null; phone_normalized: string | null }[]
    | null;
  repair_access_devices:
    | { device_type: string; brand: string | null; model: string | null }
    | { device_type: string; brand: string | null; model: string | null }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function sanitizeRawValue(value: unknown, key: string) {
  if (normalizeHistoricalHeader(key) === "password") {
    return normalizeHistoricalText(value) ? "[REDACTED]" : null;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 4_000) {
    return `[OMITTED_LONG_VALUE:${value.length}]`;
  }
  if (Buffer.isBuffer(value)) return `[OMITTED_BINARY:${value.byteLength}]`;
  return value;
}

function sanitizeRawRow(row: HistoricalRow) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => [key, sanitizeRawValue(value, key)])
  );
}

async function fetchExistingCustomers() {
  const { data, error } = await supabase
    .from("repair_access_customers")
    .select(
      "id, full_name, full_name_normalized, phone, phone_normalized, alternate_phone, alternate_phone_normalized, dni, email, address, notes"
    )
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ExistingCustomerRow[];
}

async function fetchExistingImportedOrders(): Promise<ExistingHistoricalOrder[]> {
  const result = await supabase
    .from("repair_access_orders")
    .select("id, legacy_order_number, import_row_key")
    .eq("import_source", SOURCE);

  if (result.error?.code === "42703") return [];
  if (result.error) throw result.error;

  return (result.data ?? []).map((order) => ({
    id: order.id,
    stableKey: order.import_row_key,
    legacyOrderNumber: order.legacy_order_number
  }));
}

async function fetchCurrentOrders() {
  const { data, error } = await supabase
    .from("repair_access_orders")
    .select(
      `
        id,
        order_number,
        repair_number,
        import_source,
        intake_date,
        issue_reported,
        repair_access_customers (full_name, full_name_normalized, phone_normalized),
        repair_access_devices (device_type, brand, model)
      `
    );

  if (error) throw error;
  return (data ?? []) as CurrentOrderRow[];
}

function findContentCollisionCandidates(
  rows: ReturnType<typeof normalizeHistoricalRepairRow>[],
  currentOrders: CurrentOrderRow[]
) {
  const collisions: Array<{
    legacyOrderNumber: string;
    currentOrderId: string;
    currentRepairNumber: string | null;
    reason: string;
  }> = [];

  for (const row of rows) {
    for (const current of currentOrders) {
      if (current.import_source === SOURCE) continue;
      const customer = firstRelation(current.repair_access_customers);
      const device = firstRelation(current.repair_access_devices);
      if (current.intake_date !== row.order.intakeDate) continue;

      const samePhone =
        Boolean(row.customer.phoneNormalized) &&
        customer?.phone_normalized === row.customer.phoneNormalized;
      const sameName =
        customer?.full_name_normalized === row.customer.fullNameNormalized;
      const sameDevice =
        normalizeHistoricalHeader(device?.device_type) ===
        normalizeHistoricalHeader(row.device.deviceType);
      const sameIssue =
        normalizeHistoricalHeader(current.issue_reported) ===
        normalizeHistoricalHeader(row.order.issueReported);

      if ((samePhone || sameName) && sameDevice && sameIssue) {
        collisions.push({
          legacyOrderNumber: row.legacyOrderNumber,
          currentOrderId: current.id,
          currentRepairNumber: current.repair_number,
          reason: "misma_fecha_cliente_equipo_falla"
        });
      }
    }
  }

  return collisions;
}

function countBy<T>(values: T[], getKey: (value: T) => string) {
  return Object.fromEntries(
    Array.from(
      values.reduce((counts, value) => {
        const key = getKey(value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
    ).sort(([left], [right]) => left.localeCompare(right))
  );
}

async function writeReport(report: object, label: "dry-run" | "apply" | "rollback") {
  const reportDirectory = path.join(process.cwd(), "reports", "repair-history-import");
  await fs.mkdir(reportDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const timestampedPath = path.join(reportDirectory, `${label}-${timestamp}.json`);
  const latestPath = path.join(reportDirectory, `latest-${label}.json`);
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    fs.writeFile(timestampedPath, contents, "utf8"),
    fs.writeFile(latestPath, contents, "utf8")
  ]);
  return { timestampedPath, latestPath };
}

async function fetchAllTableRows(client: SupabaseClient, table: string) {
  const pageSize = 1_000;
  const rows: unknown[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function createBackup() {
  const tables = [
    "repair_access_customers",
    "repair_access_devices",
    "repair_access_orders",
    "repair_access_status_history",
    "repair_access_import_batches",
    "repair_access_import_rows"
  ];
  const snapshots = await Promise.all(
    tables.map(async (table) => [table, await fetchAllTableRows(supabase, table)] as const)
  );
  const backupDirectory = path.join(process.cwd(), "tmp", "backups");
  await fs.mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `repair-history-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await fs.writeFile(
    backupPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectUrl: url,
        tables: Object.fromEntries(snapshots)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return backupPath;
}

async function main() {
  if (rollbackBatchId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rollbackBatchId)) {
      throw new Error("El identificador del lote de reversa no es valido.");
    }
    if (confirmation !== `ROLLBACK-${rollbackBatchId}`) {
      throw new Error(
        `Reversa bloqueada. Repite con --rollback=${rollbackBatchId} --confirm=ROLLBACK-${rollbackBatchId}.`
      );
    }

    const backupPath = await createBackup();
    const { data, error } = await supabase.rpc("rollback_repair_history_import", {
      p_batch_id: rollbackBatchId
    });
    if (error) throw error;

    const rollbackReport = {
      mode: "rolled_back",
      rolledBackAt: new Date().toISOString(),
      batchId: rollbackBatchId,
      backupPath,
      databaseResult: data
    };
    const rollbackPaths = await writeReport(rollbackReport, "rollback");
    console.log(
      JSON.stringify(
        {
          rolledBack: true,
          backupPath,
          databaseResult: data,
          report: rollbackPaths.latestPath
        },
        null,
        2
      )
    );
    return;
  }

  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("El Excel no contiene una hoja importable.");

  const rawRows = xlsx.utils.sheet_to_json<HistoricalRow>(sheet, {
    defval: null,
    raw: true
  });
  const normalizedRows: ReturnType<typeof normalizeHistoricalRepairRow>[] = [];
  const invalidRows: Array<{ rowNumber: number; message: string }> = [];

  rawRows.forEach((row, index) => {
    try {
      normalizedRows.push(normalizeHistoricalRepairRow(row, index + 2));
    } catch (error) {
      invalidRows.push({
        rowNumber: index + 2,
        message: error instanceof Error ? error.message : "Fila invalida."
      });
    }
  });

  const [existingCustomerRows, existingOrders, currentOrders] = await Promise.all([
    fetchExistingCustomers(),
    fetchExistingImportedOrders(),
    fetchCurrentOrders()
  ]);
  const existingCustomers: ExistingHistoricalCustomer[] = existingCustomerRows.map(
    (customer) => ({
      id: customer.id,
      fullNameNormalized:
        customer.full_name_normalized ??
        normalizeHistoricalHeader(customer.full_name),
      phoneNormalized: customer.phone_normalized,
      alternatePhoneNormalized: customer.alternate_phone_normalized,
      dni: customer.dni,
      addressNormalized: customer.address
        ? normalizeHistoricalHeader(customer.address)
        : null
    })
  );
  const plan = buildRepairHistoryImportPlan({
    rows: normalizedRows,
    existingCustomers,
    existingOrders
  });
  const publicOrderNumberPlan = buildHistoricalPublicOrderNumberPlan(normalizedRows, {
    maximumPublicOrderNumber: 265
  });
  const stableKeyCounts = countBy(normalizedRows, (row) => row.stableKey);
  const duplicateStableKeys = Object.entries(stableKeyCounts)
    .filter(([, count]) => count > 1)
    .map(([stableKey, count]) => ({ stableKey, count }));
  const contentCollisionCandidates = findContentCollisionCandidates(
    normalizedRows,
    currentOrders
  );
  const currentOrderByPublicNumber = new Map(
    currentOrders.map((order) => [order.order_number, order])
  );
  const publicNumberCollisions = plan.orders.flatMap((entry) => {
    const publicOrderNumber =
      publicOrderNumberPlan.byLegacyOrderNumber[entry.row.legacyOrderNumber];
    const occupiedBy = currentOrderByPublicNumber.get(publicOrderNumber);
    return occupiedBy
      ? [
          {
            legacyOrderNumber: entry.row.legacyOrderNumber,
            publicOrderNumber,
            occupiedOrderId: occupiedBy.id,
            occupiedRepairNumber: occupiedBy.repair_number
          }
        ]
      : [];
  });
  const today = getOperationalDate();
  const warrantyStates = normalizedRows.map((row) =>
    getWarrantyState({
      hasWarranty: row.order.hasWarranty,
      warrantyDays: row.order.warrantyDays,
      pickedUpAt: row.order.pickedUpAt,
      repairStatus: row.order.status,
      warrantyStart: row.order.warrantyStart,
      warrantyUntil: row.order.warrantyUntil,
      requiresReview: row.order.warrantyRequiresReview,
      today
    }).code
  );
  const durationValues = rawRows
    .map((row) => getHistoricalRowValue(row, "garantiatiempodefalla"))
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .map((value) => String(Number(value)));
  const criticalErrors = [
    ...invalidRows.map((row) => `fila_${row.rowNumber}_invalida`),
    ...duplicateStableKeys.map((entry) => `clave_duplicada_${entry.stableKey}`),
    ...contentCollisionCandidates.map(
      (entry) => `posible_orden_ya_existente_${entry.legacyOrderNumber}`
    ),
    ...publicNumberCollisions.map(
      (entry) => `numero_publico_ocupado_${entry.publicOrderNumber}`
    )
  ];
  const coverage = plan.summary.ordersNew + plan.summary.ordersSkipped;
  const applyReady =
    rawRows.length === EXPECTED_ROWS &&
    normalizedRows.length === EXPECTED_ROWS &&
    coverage === EXPECTED_ROWS &&
    criticalErrors.length === 0;

  const report = {
    mode: applyMode ? "apply_requested" : "dry_run",
    generatedAt: new Date().toISOString(),
    operationalDate: today,
    file: path.basename(workbookPath),
    sheet: sheetName,
    applyReady,
    criticalErrors,
    summary: {
      rowsRead: rawRows.length,
      rowsNormalized: normalizedRows.length,
      invalidRows: invalidRows.length,
      existingCustomers: existingCustomers.length,
      ...plan.summary,
      ambiguousMatches: plan.ambiguousRows.length,
      ordersRequiringReview: normalizedRows.filter(
        (row) => row.reviewReasons.length > 0
      ).length,
      retiredWithoutPickupDate: normalizedRows.filter((row) =>
        row.reviewReasons.includes("retirada_sin_fecha")
      ).length,
      contentCollisionCandidates: contentCollisionCandidates.length
    },
    sourceReconciliation: {
      expectedRows: EXPECTED_ROWS,
      uniqueLegacyOrderNumbers: new Set(
        normalizedRows.map((row) => row.legacyOrderNumber)
      ).size,
      closedLegacyGaps: publicOrderNumberPlan.closedLegacyGaps,
      maximumPublicOrderNumber:
        publicOrderNumberPlan.maximumPublicOrderNumber,
      duplicateStableKeys,
      intakeDateRange: [
        normalizedRows.map((row) => row.order.intakeDate).sort()[0] ?? null,
        normalizedRows.map((row) => row.order.intakeDate).sort().at(-1) ?? null
      ],
      statusCounts: countBy(normalizedRows, (row) => row.order.status),
      warrantyDurationCounts: countBy(durationValues, (value) => value),
      warrantyStateCounts: countBy(warrantyStates, (state) => state)
    },
    retiredWithoutPickupDate: normalizedRows
      .filter((row) => row.reviewReasons.includes("retirada_sin_fecha"))
      .map((row) => ({
        rowNumber: row.rowNumber,
        legacyOrderNumber: row.legacyOrderNumber,
        customer: row.customer.fullName,
        warrantyDays: row.order.warrantyDays
      })),
    ambiguousMatches: plan.ambiguousRows,
    reviewRows: normalizedRows
      .filter((row) => row.reviewReasons.length > 0)
      .map((row) => ({
        rowNumber: row.rowNumber,
        legacyOrderNumber: row.legacyOrderNumber,
        customer: row.customer.fullName,
        reasons: row.reviewReasons
      })),
    invalidRows,
    contentCollisionCandidates,
    publicNumberCollisions
  };

  const dryRunPaths = await writeReport(report, "dry-run");
  console.log(
    JSON.stringify(
      {
        applyReady,
        file: report.file,
        summary: report.summary,
        reconciliation: report.sourceReconciliation,
        criticalErrors,
        report: dryRunPaths.latestPath
      },
      null,
      2
    )
  );

  if (!applyMode) return;
  if (!applyReady) {
    throw new Error("La importacion fue bloqueada porque el dry-run tiene errores criticos.");
  }
  if (confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Modo escritura bloqueado. Repite con --apply --confirm=${APPLY_CONFIRMATION}.`
    );
  }

  const backupPath = await createBackup();
  const payload = {
    source: SOURCE,
    fileName: path.basename(workbookPath),
    sheetName,
    expectedRows: EXPECTED_ROWS,
    dryRunSummary: report.summary,
    customers: plan.customers.map((customer) => ({
      key: customer.key,
      existingId: customer.existingId,
      rowNumbers: customer.rowNumbers,
      matchReason: customer.matchReason,
      data: customer.data
    })),
    orders: plan.orders.map((entry) => ({
      customerKey: entry.customerKey,
      matchKind: entry.matchKind,
      matchReason: entry.matchReason,
      row: {
        ...entry.row,
        publicOrderNumber:
          publicOrderNumberPlan.byLegacyOrderNumber[
            entry.row.legacyOrderNumber
          ]
      },
      rawData: sanitizeRawRow(rawRows[entry.row.rowNumber - 2] ?? {})
    })),
    skippedOrders: plan.skippedOrders.map((entry) => ({
      ...entry,
      rawData: sanitizeRawRow(rawRows[entry.rowNumber - 2] ?? {})
    }))
  };
  const { data, error } = await supabase.rpc("import_repair_history_transaction", {
    p_payload: payload
  });
  if (error) throw error;

  const applyReport = {
    ...report,
    mode: "applied",
    appliedAt: new Date().toISOString(),
    backupPath,
    databaseResult: data
  };
  const applyPaths = await writeReport(applyReport, "apply");
  console.log(
    JSON.stringify(
      {
        applied: true,
        backupPath,
        databaseResult: data,
        report: applyPaths.latestPath
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
