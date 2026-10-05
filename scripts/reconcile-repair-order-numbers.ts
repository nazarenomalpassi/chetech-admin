import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildRepairOrderRenumberPlan,
  formatRepairOrderNumber,
  parseRepairOrderNumber,
  type RepairOrderNumberSnapshot
} from "@/features/repairs-access/order-number-reconciliation";

const LEGACY_SOURCE = "service_export_excel";
const SOURCE_FILE = "Service Exporado.xlsx";
const CURRENT_SYSTEM_START = 266;
const CURRENT_SYSTEM_END = 385;
const HISTORICAL_PUBLIC_MAX = 265;

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupMode = process.argv.includes("--backup");
const rollbackRunId = process.argv
  .find((argument) => argument.startsWith("--rollback="))
  ?.split("=")[1];
const confirmation = process.argv
  .find((argument) => argument.startsWith("--confirm="))
  ?.split("=")[1];

if (!url || !serviceRoleKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local."
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

type OrderRow = {
  id: string;
  repair_number: string;
  legacy_order_number: string | null;
  import_source: string | null;
  import_file_name: string | null;
  customer_id: string;
  device_id: string;
  intake_date: string;
  created_at: string;
};

type NamedRow = {
  id: string;
  [key: string]: unknown;
};

async function fetchAllTableRows(
  client: SupabaseClient,
  table: string,
  select = "*"
) {
  const rows: unknown[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function getLegacyGaps(orders: OrderRow[]) {
  const legacyNumbers = orders
    .filter(
      (order) =>
        order.import_source === LEGACY_SOURCE &&
        order.import_file_name === SOURCE_FILE
    )
    .map((order) => parseRepairOrderNumber(order.legacy_order_number))
    .sort((left, right) => left - right);
  const legacySet = new Set(legacyNumbers);
  const maximum = legacyNumbers.at(-1) ?? 0;
  return Array.from({ length: maximum }, (_, index) => index + 1).filter(
    (number) => !legacySet.has(number)
  );
}

function buildSnapshots(orders: OrderRow[]): RepairOrderNumberSnapshot[] {
  return orders.map((order) => ({
    id: order.id,
    repairNumber: order.repair_number,
    legacyOrderNumber: order.legacy_order_number,
    importSource: order.import_source,
    createdAt: order.created_at
  }));
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return Object.fromEntries(
    Array.from(
      items.reduce((counts, item) => {
        const key = getKey(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
    ).sort(([left], [right]) => left.localeCompare(right))
  );
}

async function writeJson(directory: string, label: string, value: object) {
  await fs.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const timestampedPath = path.join(directory, `${label}-${timestamp}.json`);
  const latestPath = path.join(directory, `latest-${label}.json`);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await Promise.all([
    fs.writeFile(timestampedPath, contents, "utf8"),
    fs.writeFile(latestPath, contents, "utf8")
  ]);
  return { timestampedPath, latestPath };
}

async function createBackup() {
  const tables = [
    "repair_access_orders",
    "repair_access_customers",
    "repair_access_devices",
    "repair_access_status_history",
    "repair_access_payments",
    "repair_access_budgets",
    "repair_customer_updates",
    "repair_outsourcings",
    "repair_access_import_rows",
    "repairs"
  ];
  const snapshots = await Promise.all(
    tables.map(async (table) => [
      table,
      await fetchAllTableRows(supabase, table)
    ] as const)
  );
  const output = await writeJson(
    path.join(process.cwd(), "tmp", "backups"),
    "repair-order-numbers-before",
    {
      createdAt: new Date().toISOString(),
      projectUrl: url,
      sourceFile: SOURCE_FILE,
      tables: Object.fromEntries(snapshots)
    }
  );
  return output.timestampedPath;
}

async function buildDiagnostic() {
  const [orderData, customersData, devicesData] = await Promise.all([
    fetchAllTableRows(
      supabase,
      "repair_access_orders",
      "id,repair_number,legacy_order_number,import_source,import_file_name,customer_id,device_id,intake_date,created_at"
    ),
    fetchAllTableRows(supabase, "repair_access_customers", "id,full_name"),
    fetchAllTableRows(
      supabase,
      "repair_access_devices",
      "id,device_type,brand,model"
    )
  ]);
  const orders = orderData as OrderRow[];
  const customers = new Map(
    (customersData as NamedRow[]).map((row) => [row.id, row.full_name])
  );
  const devices = new Map(
    (devicesData as NamedRow[]).map((row) => [
      row.id,
      [row.device_type, row.brand, row.model].filter(Boolean).join(" - ")
    ])
  );
  const knownLegacyGaps = getLegacyGaps(orders);
  const plan = buildRepairOrderRenumberPlan(buildSnapshots(orders), {
    historicalMax: HISTORICAL_PUBLIC_MAX,
    currentSystemStart: CURRENT_SYSTEM_START,
    currentSystemEnd: CURRENT_SYSTEM_END,
    legacySource: LEGACY_SOURCE,
    knownLegacyGaps
  });
  const targetSet = new Set(plan.entries.map((entry) => entry.newNumber));
  const targetMaximum = plan.nextNumber - 1;
  const missingTargetNumbers = Array.from(
    { length: targetMaximum },
    (_, index) => index + 1
  ).filter((number) => !targetSet.has(number));
  const preview = plan.entries
    .filter(
      (entry) =>
        entry.currentNumber !== entry.newNumber ||
        [1, 265, 266, 385, 386, 387, 388].includes(entry.newNumber)
    )
    .sort((left, right) => left.newNumber - right.newNumber)
    .map((entry) => {
      const source = orders.find((order) => order.id === entry.id);
      return {
        id: entry.id,
        currentRepairNumber: entry.repairNumber,
        currentNumber: entry.currentNumber,
        newRepairNumber: formatRepairOrderNumber(entry.newNumber),
        newNumber: entry.newNumber,
        legacyOrderNumber: entry.legacyOrderNumber,
        customer: source ? customers.get(source.customer_id) ?? null : null,
        device: source ? devices.get(source.device_id) ?? null : null,
        intakeDate: source?.intake_date ?? null,
        createdAt: entry.createdAt,
        origin: entry.origin,
        reason: entry.reason
      };
    });
  const historicalCount = plan.entries.filter(
    (entry) => entry.origin === "legacy_import"
  ).length;
  const currentSystemCount = plan.entries.filter(
    (entry) => entry.origin === "current_system"
  ).length;
  const postImportCount = plan.entries.filter(
    (entry) => entry.origin === "post_import"
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    projectUrl: url,
    sourceFile: SOURCE_FILE,
    summary: {
      totalOrders: orders.length,
      historicalOrders: historicalCount,
      currentSystemOrders: currentSystemCount,
      postImportOrders: postImportCount,
      changedOrders: plan.entries.filter(
        (entry) => entry.currentNumber !== entry.newNumber
      ).length,
      preservedOrders: plan.entries.filter(
        (entry) => entry.currentNumber === entry.newNumber
      ).length,
      currentMinimum: Math.min(
        ...plan.entries.map((entry) => entry.currentNumber)
      ),
      currentMaximum: Math.max(
        ...plan.entries.map((entry) => entry.currentNumber)
      ),
      targetMinimum: Math.min(...plan.entries.map((entry) => entry.newNumber)),
      targetMaximum,
      nextNumber: plan.nextNumber,
      legacyGapsBefore: knownLegacyGaps,
      closedLegacyGaps: plan.closedLegacyGaps,
      targetGapsAfter: missingTargetNumbers,
      origins: countBy(plan.entries, (entry) => entry.origin),
      reasons: countBy(plan.entries, (entry) => entry.reason)
    },
    checks: {
      uniqueTargets:
        new Set(plan.entries.map((entry) => entry.newNumber)).size ===
        plan.entries.length,
      allPositive: plan.entries.every((entry) => entry.newNumber > 0),
      legacyCountIs261: historicalCount === 261,
      currentRangeIsComplete: currentSystemCount === 120,
      legacyLastMapsTo265: plan.entries.some(
        (entry) =>
          entry.legacyOrderNumber === "266" && entry.newNumber === 265
      ),
      postImportStartsAt386:
        postImportCount === 0 ||
        Math.min(
          ...plan.entries
            .filter((entry) => entry.origin === "post_import")
            .map((entry) => entry.newNumber)
        ) === 386
    },
    preview
  };
}

async function main() {
  if (rollbackRunId) {
    if (confirmation !== `ROLLBACK-${rollbackRunId}`) {
      throw new Error(
        `Reversa bloqueada. Usa --rollback=${rollbackRunId} --confirm=ROLLBACK-${rollbackRunId}.`
      );
    }
    const backupPath = await createBackup();
    const { data, error } = await supabase.rpc(
      "rollback_repair_order_number_reconciliation",
      { p_run_id: rollbackRunId }
    );
    if (error) throw error;
    const report = await writeJson(
      path.join(process.cwd(), "reports", "repair-order-number-reconciliation"),
      "rollback",
      { backupPath, result: data }
    );
    console.log(JSON.stringify({ backupPath, report, result: data }, null, 2));
    return;
  }

  const diagnostic = await buildDiagnostic();
  const backupPath = backupMode ? await createBackup() : null;
  const report = await writeJson(
    path.join(process.cwd(), "reports", "repair-order-number-reconciliation"),
    backupMode ? "preflight-with-backup" : "preflight",
    { ...diagnostic, backupPath }
  );
  console.log(
    JSON.stringify(
      {
        mode: backupMode ? "preflight-with-backup" : "preflight",
        backupPath,
        report,
        summary: diagnostic.summary,
        checks: diagnostic.checks
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
