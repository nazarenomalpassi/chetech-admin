import { createHash } from "node:crypto";

export type ExportRow = Record<string, unknown>;
type TableSpec = { table: string; module: string; identity: string | string[]; optional?: boolean };

export const OPERATIONAL_TABLES: TableSpec[] = [
  ...["profiles", "app_settings", "audit_logs"].map(table => ({ table, module: "administration", identity: table === "app_settings" ? "key" : "id" })),
  ...["categories", "products", "stock_movements", "movimientos_stock", "replenishment_plan_items"].map(table => ({ table, module: "inventory", identity: "id" })),
  ...["clientes", "sales", "sale_items", "sale_payments", "tv_boards", "installment_sales", "installments"].map(table => ({ table, module: "commercial", identity: "id" })),
  ...["expenses", "movimientos_caja", "cierres_caja", "balance_transfers", "salary_withdrawals", "salary_members", "financial_reserves", "salary_liquidations", "salary_liquidation_members", "salary_liquidation_funding"].map(table => ({ table, module: "finance", identity: "id" })),
  ...["repairs", "repair_payments", "repair_access_customers", "repair_access_devices", "repair_access_orders", "repair_access_status_history", "repair_access_payments", "repair_access_budgets", "repair_access_import_batches", "repair_access_import_rows", "repair_outsourcings", "visits"].map(table => ({ table, module: "workshop", identity: "id" })),
  ...["invoices", "invoice_items", "invoice_payments"].map(table => ({ table, module: "documents", identity: "id" })),
  { table: "operations_cash_reconciliations", module: "finance", identity: "id", optional: true },
  ...["repair_budget_versions", "repair_customer_decisions", "repair_part_requests", "workshop_events", "workshop_tasks"].map(table => ({ table, module: "workshop", identity: "id", optional: true })),
  { table: "fiscal_issuance_records", module: "fiscal", identity: "id", optional: true },
  { table: "fiscal_issuance_counters", module: "fiscal", identity: ["environment", "issuer_cuit", "point_of_sale", "voucher_type"], optional: true },
  { table: "operations_cash_reconciliation_amendments", module: "finance", identity: "id", optional: true },
  { table: "repair_order_attachments", module: "workshop", identity: "id", optional: true }
];

export type ExportClient = {
  from(table: string): any;
};

export type OperationalExport = {
  format: "chetech-operational-export";
  version: 1;
  manifest: {
    startedAt: string;
    completedAt: string;
    sourceRevision: string | null;
    schema: "public";
    fullDatabaseBackup: false;
    consistency: "non-transactional";
    exclusions: string[];
    totalRows: number;
    tables: (TableSpec & { rowCount: number; sha256: string; availability: "exported" | "not-deployed" })[];
  };
  manifestSha256: string;
  data: Record<string, ExportRow[]>;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

class ExportReadError extends Error {
  constructor(table: string, public code: string | undefined, message: string) { super(`${table}: ${message}`); }
}

export function identityColumns(identity: TableSpec["identity"]) { return Array.isArray(identity) ? identity : [identity]; }
function rowIdentity(row: ExportRow, spec: TableSpec) {
  const values = identityColumns(spec.identity).map(column => row[column]);
  if (values.some(value => value == null || !["string", "number"].includes(typeof value))) throw new Error(`${spec.table}: missing or invalid identity`);
  return JSON.stringify(values);
}

export async function readExportTable(db: ExportClient, spec: TableSpec, pageSize = 500, columns = "*") {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid export page size");
  const rows: ExportRow[] = [];
  const identities = new Set<unknown>();
  let expectedCount: number | undefined;
  // Advance by the actual response size: a server-side cap can be smaller than pageSize.
  do {
    let query = db.from(spec.table).select(columns, { count: "exact" });
    for (const column of identityColumns(spec.identity)) query = query.order(column, { ascending: true });
    const result = await query.range(rows.length, rows.length + pageSize - 1);
    if (result.error) throw new ExportReadError(spec.table, result.error.code, result.error.message);
    if (!Number.isSafeInteger(result.count) || result.count < 0) throw new Error(`${spec.table}: unavailable exact count`);
    if (expectedCount !== undefined && expectedCount !== result.count) throw new Error(`${spec.table}: count changed during export; retry in a quiet window`);
    expectedCount = result.count;
    const page = result.data ?? [];
    if (!Array.isArray(page) || (page.length === 0 && rows.length < result.count)) throw new Error(`${spec.table}: incomplete/truncated export`);
    for (const row of page) {
      if (columns === "*") {
        const identity = rowIdentity(row, spec);
        if (identities.has(identity)) throw new Error(`${spec.table}: duplicate identity; retry export`);
        identities.add(identity);
      }
      rows.push(row);
    }
    if (rows.length > result.count) throw new Error(`${spec.table}: inconsistent count`);
  } while (rows.length < expectedCount!);

  const final = await db.from(spec.table).select(identityColumns(spec.identity).join(","), { count: "exact", head: true });
  if (final.error) throw new Error(`${spec.table}: ${final.error.message}`);
  if (final.count !== rows.length) throw new Error(`${spec.table}: count changed during export`);
  return rows;
}

export async function createOperationalExport(db: ExportClient, options: { pageSize?: number; sourceRevision?: string } = {}): Promise<OperationalExport> {
  const startedAt = new Date().toISOString();
  const data: Record<string, ExportRow[]> = {};
  const tables: OperationalExport["manifest"]["tables"] = [];
  for (const spec of OPERATIONAL_TABLES) {
    let rows: ExportRow[];
    let availability: "exported" | "not-deployed" = "exported";
    try {
      rows = await readExportTable(db, spec, options.pageSize);
    } catch (error) {
      if (!spec.optional || !(error instanceof ExportReadError) || !["42P01", "PGRST205"].includes(error.code ?? "")) throw error;
      rows = [];
      availability = "not-deployed";
    }
    data[spec.table] = rows;
    tables.push({ ...spec, rowCount: rows.length, sha256: checksum(rows), availability });
  }
  const manifest: OperationalExport["manifest"] = {
    startedAt, completedAt: new Date().toISOString(), sourceRevision: options.sourceRevision ?? null,
    schema: "public", fullDatabaseBackup: false, consistency: "non-transactional",
    exclusions: ["auth schema and sessions", "storage schema and object bytes", "private and other schemas", "DDL, constraints, indexes, RLS policies, functions, triggers, grants and sequences", "project configuration, secrets and external services"],
    totalRows: tables.reduce((total, table) => total + table.rowCount, 0), tables
  };
  return { format: "chetech-operational-export", version: 1, manifest, manifestSha256: checksum(manifest), data };
}

export function verifyOperationalExport(value: unknown) {
  const backup = value as OperationalExport;
  if (!backup || backup.format !== "chetech-operational-export" || backup.version !== 1 || !backup.manifest || !backup.data) throw new Error("Unsupported operational export");
  if (checksum(backup.manifest) !== backup.manifestSha256) throw new Error("Manifest checksum mismatch");
  if (backup.manifest.fullDatabaseBackup !== false || backup.manifest.consistency !== "non-transactional") throw new Error("Invalid export scope");
  if (!Array.isArray(backup.manifest.tables) || backup.manifest.tables.length !== Object.keys(backup.data).length) throw new Error("Incomplete table inventory");
  if (Object.keys(backup.data).some(table => !OPERATIONAL_TABLES.some(spec => spec.table === table))) throw new Error("Unknown table inventory version");
  let total = 0;
  for (const spec of OPERATIONAL_TABLES) {
    const entries = backup.manifest.tables.filter(table => table.table === spec.table);
    // Old artifacts remain valid when a later release adds optional tables.
    if (spec.optional && entries.length === 0 && !Object.hasOwn(backup.data, spec.table)) continue;
    const entry = entries[0];
    if (entries.length !== 1 || entry.module !== spec.module || JSON.stringify(entry.identity) !== JSON.stringify(spec.identity)) throw new Error(`${spec.table}: invalid provenance`);
    const rows = backup.data[spec.table];
    if (entry.availability !== "exported" && !(spec.optional && entry.availability === "not-deployed" && entry.rowCount === 0)) throw new Error(`${spec.table}: invalid availability`);
    if (!Array.isArray(rows) || rows.length !== entry.rowCount) throw new Error(`${spec.table}: row count mismatch`);
    if (checksum(rows) !== entry.sha256) throw new Error(`${spec.table}: checksum mismatch`);
    if (new Set(rows.map(row => rowIdentity(row, spec))).size !== rows.length) throw new Error(`${spec.table}: invalid identities`);
    total += rows.length;
  }
  if (total !== backup.manifest.totalRows) throw new Error("Total row count mismatch");
  return { tableCount: backup.manifest.tables.length, rowCount: total };
}
