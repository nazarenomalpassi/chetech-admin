type CatalogRow = Record<string, any>;
export type BaselineCatalog = Record<string, any>;
export type BaselinePhase = "base" | "constraints" | "security";

const supportedExtensions = new Set(["pgcrypto", "uuid-ossp", "pg_trgm", "unaccent", "citext", "btree_gist"]);
const integerBounds: Record<string, [string, string]> = {
  smallint: ["-32768", "32767"], integer: ["-2147483648", "2147483647"],
  bigint: ["-9223372036854775808", "9223372036854775807"]
};
const q = (name: string) => {
  if (!name || name.includes("\0")) throw new Error("Invalid catalog identifier");
  return `"${name.replaceAll('"', '""')}"`;
};
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const relation = (schema: string, name: string) => `${q(schema)}.${q(name)}`;
const role = (name: string) => name === "PUBLIC" ? "PUBLIC" : q(name);
const rows = (catalog: BaselineCatalog, key: string): CatalogRow[] => catalog[key] ?? [];
const statement = (sql: string) => `${sql.trim().replace(/;$/, "")};`;

export function baselineLimitations(catalog: BaselineCatalog): string[] {
  return [
    "Catalog reconstruction is not a full PostgreSQL/Auth/Storage recovery; no passwords, sessions, private data or Storage bytes are supplied.",
    "Role membership/attributes, publication options and sequence is_called are not present in this catalog; missing roles are NOLOGIN scaffolds only.",
    "Unsafe numeric standard sequence bounds are emitted as exact PostgreSQL type bounds; other unsafe sequence integers are rejected.",
    ...rows(catalog, "extensions").filter(e => e.name !== "plpgsql" && !supportedExtensions.has(e.name)).map(e => `Extension ${e.name} is not reconstructed; review dependencies separately.`)
  ];
}

function sequenceInteger(value: unknown, bound?: string): string {
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value).toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  // JSON numbers cannot encode int8's standard extrema without rounding.
  if (bound && typeof value === "number" && value === Number(bound)) return bound;
  throw new Error("Unsafe sequence integer: supply exact decimal metadata");
}

function sequenceOptions(sequence: CatalogRow): string {
  const bounds = integerBounds[sequence.data_type];
  if (!bounds) throw new Error("Unsupported sequence data type");
  return `INCREMENT BY ${sequenceInteger(sequence.increment_by)} MINVALUE ${sequenceInteger(sequence.min_value, bounds[0])} MAXVALUE ${sequenceInteger(sequence.max_value, bounds[1])} START WITH ${sequenceInteger(sequence.start_value)} CACHE ${sequenceInteger(sequence.cache_size)} ${sequence.cycle ? "CYCLE" : "NO CYCLE"}`;
}

function signature(fn: CatalogRow): string { return `${relation(fn.schema, fn.name)}(${fn.arguments ?? ""})`; }
function routineKind(fn: CatalogRow): string { return /^\s*CREATE(?: OR REPLACE)? PROCEDURE\b/i.test(fn.definition) ? "PROCEDURE" : "FUNCTION"; }
function grantOption(grant: CatalogRow): string { return grant.grantable ? " WITH GRANT OPTION" : ""; }
function privilege(value: string): string {
  if (!["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN", "USAGE", "CREATE", "EXECUTE"].includes(value)) throw new Error("Unsupported catalog privilege");
  return value;
}

/** Generate DDL only. Execute base, import bound rows, then constraints and security in an isolated DB. */
export function buildBaselineStatements(catalog: BaselineCatalog, options: { phase?: BaselinePhase } = {}): string[] {
  const base: string[] = [], constraints: string[] = [], security: string[] = [];
  const tables = rows(catalog, "tables").filter(t => t.kind === "r" || t.kind === "p");
  if (tables.some(t => t.kind === "p")) throw new Error("Partition metadata is required before reconstructing partitioned tables");
  const columns = rows(catalog, "columns");
  const ownedSequences = rows(catalog, "sequenceOwnership");
  const sequences = rows(catalog, "sequences");
  const identitySequences = new Set(ownedSequences.filter(s => columns.some(c => c.schema === s.table_schema && c.table_name === s.table_name && c.name === s.column_name && c.identity)).map(s => `${s.schema}.${s.name}`));
  const roleNames = new Set<string>();
  for (const key of ["tables", "functions", "schemaGrants", "relationGrants", "columnGrants", "defaultGrants"]) {
    for (const row of rows(catalog, key)) {
      if (row.owner) roleNames.add(row.owner);
      if (row.grantee) roleNames.add(row.grantee);
      for (const grant of row.grants ?? []) roleNames.add(grant.grantee);
    }
  }
  for (const s of sequences) if (s.sequenceowner) roleNames.add(s.sequenceowner);
  for (const policy of rows(catalog, "policies")) for (const name of policy.roles ?? []) roleNames.add(name);
  for (const name of ["anon", "authenticated", "service_role"]) roleNames.add(name);
  for (const name of [...roleNames].sort()) {
    if (name === "PUBLIC" || name.startsWith("pg_")) continue;
    base.push(`DO $baseline_role$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${literal(name)}) THEN CREATE ROLE ${q(name)} NOLOGIN; END IF; END $baseline_role$;`);
  }
  const schemas = new Set(["public", "private", "auth", "storage", "extensions"]);
  for (const key of ["tables", "enums", "functions", "schemaGrants"]) for (const row of rows(catalog, key)) schemas.add(row.schema);
  for (const extension of rows(catalog, "extensions")) if (supportedExtensions.has(extension.name)) schemas.add(extension.schema);
  for (const schema of [...schemas].sort()) {
    base.push(`CREATE SCHEMA IF NOT EXISTS ${q(schema)};`);
    const owner = rows(catalog, "schemaGrants").find(s => s.schema === schema)?.owner;
    if (owner) base.push(`ALTER SCHEMA ${q(schema)} OWNER TO ${q(owner)};`);
  }
  for (const extension of rows(catalog, "extensions")) {
    if (supportedExtensions.has(extension.name)) base.push(`CREATE EXTENSION IF NOT EXISTS ${q(extension.name)} WITH SCHEMA ${q(extension.schema)};`);
  }
  base.push("SET check_function_bodies = off;");
  for (const type of rows(catalog, "enums")) base.push(`CREATE TYPE ${relation(type.schema, type.name)} AS ENUM (${type.values.map(literal).join(", ")});`);
  for (const sequence of sequences) {
    if (identitySequences.has(`${sequence.schemaname}.${sequence.sequencename}`)) continue;
    base.push(`CREATE SEQUENCE ${relation(sequence.schemaname, sequence.sequencename)} AS ${sequence.data_type} ${sequenceOptions(sequence)};`);
    if (sequence.sequenceowner) base.push(`ALTER SEQUENCE ${relation(sequence.schemaname, sequence.sequencename)} OWNER TO ${q(sequence.sequenceowner)};`);
  }
  for (const table of tables) {
    const fields = columns.filter(c => c.schema === table.schema && c.table_name === table.name && !c.generated).map(c => {
      let identity = "";
      if (c.identity) {
        const owned = ownedSequences.find(s => s.table_schema === table.schema && s.table_name === table.name && s.column_name === c.name);
        const sequence = owned && sequences.find(s => s.schemaname === owned.schema && s.sequencename === owned.name);
        identity = ` GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY${sequence ? ` (SEQUENCE NAME ${relation(sequence.schemaname, sequence.sequencename)} ${sequenceOptions(sequence)})` : ""}`;
      }
      return `${q(c.name)} ${c.type}${identity}${c.not_null ? " NOT NULL" : ""}`;
    });
    if (!fields.length) throw new Error("Missing bare-table column metadata");
    base.push(`CREATE TABLE ${relation(table.schema, table.name)} (${fields.join(", ")});`);
    if (table.owner) base.push(`ALTER TABLE ${relation(table.schema, table.name)} OWNER TO ${q(table.owner)};`);
  }
  for (const fn of rows(catalog, "functions")) {
    base.push(statement(fn.definition));
    if (fn.owner) base.push(`ALTER ${routineKind(fn)} ${signature(fn)} OWNER TO ${q(fn.owner)};`);
  }
  for (const table of tables) {
    for (const column of columns.filter(c => c.schema === table.schema && c.table_name === table.name)) {
      const name = relation(table.schema, table.name);
      if (column.generated) {
        base.push(`ALTER TABLE ${name} ADD COLUMN ${q(column.name)} ${column.type} GENERATED ALWAYS AS (${column.default_expression}) STORED${column.not_null ? " NOT NULL" : ""};`);
      } else if (!column.identity && column.default_expression !== null && column.default_expression !== undefined) {
        base.push(`ALTER TABLE ${name} ALTER COLUMN ${q(column.name)} SET DEFAULT ${column.default_expression};`);
      }
    }
  }
  for (const sequence of ownedSequences) {
    if (!identitySequences.has(`${sequence.schema}.${sequence.name}`)) base.push(`ALTER SEQUENCE ${relation(sequence.schema, sequence.name)} OWNED BY ${relation(sequence.table_schema, sequence.table_name)}.${q(sequence.column_name)};`);
  }
  for (const view of rows(catalog, "views")) {
    const materialized = view.kind === "m";
    const settings = view.options?.length ? ` WITH (${view.options.join(", ")})` : "";
    base.push(statement(`CREATE ${materialized ? "MATERIALIZED " : ""}VIEW ${relation(view.schema, view.name)}${settings} AS ${view.definition.trim().replace(/;$/, "")}${materialized ? " WITH NO DATA" : ""}`));
    const owner = rows(catalog, "tables").find(t => t.schema === view.schema && t.name === view.name)?.owner;
    if (owner) base.push(`ALTER ${materialized ? "MATERIALIZED " : ""}VIEW ${relation(view.schema, view.name)} OWNER TO ${q(owner)};`);
  }
  const keys = [...rows(catalog, "constraints")].sort((a, b) => Number(a.type === "f") - Number(b.type === "f"));
  for (const key of keys) {
    const unvalidated = key.validated === false && ["f", "c"].includes(key.type) && !/\bNOT VALID\b/i.test(key.definition) ? " NOT VALID" : "";
    constraints.push(`ALTER TABLE ${relation(key.schema, key.table_name)} ADD CONSTRAINT ${q(key.name)} ${key.definition}${unvalidated};`);
  }
  for (const index of rows(catalog, "indexes")) constraints.push(statement(index.definition));
  for (const trigger of rows(catalog, "triggers")) {
    constraints.push(statement(trigger.definition));
    const mode = ({ D: "DISABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" } as Record<string, string>)[trigger.enabled];
    if (mode) constraints.push(`ALTER TABLE ${relation(trigger.schema, trigger.table_name)} ${mode} TRIGGER ${q(trigger.name)};`);
  }
  const policyCommands: Record<string, string> = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", "*": "ALL" };
  for (const policy of rows(catalog, "policies")) {
    const command = policyCommands[policy.command];
    if (!command) throw new Error("Unsupported policy command");
    security.push(`CREATE POLICY ${q(policy.name)} ON ${relation(policy.schema, policy.table_name)} AS ${policy.permissive ? "PERMISSIVE" : "RESTRICTIVE"} FOR ${command} TO ${(policy.roles?.length ? policy.roles : ["PUBLIC"]).map(role).join(", ")}${policy.using_expression ? ` USING (${policy.using_expression})` : ""}${policy.check_expression ? ` WITH CHECK (${policy.check_expression})` : ""};`);
  }
  for (const table of tables) {
    security.push(`ALTER TABLE ${relation(table.schema, table.name)} ${table.rls ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY;`);
    security.push(`ALTER TABLE ${relation(table.schema, table.name)} ${table.forceRls ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY;`);
  }
  for (const fn of rows(catalog, "functions")) {
    const reset = new Set(["PUBLIC", "anon", "authenticated", "service_role", ...(fn.grants ?? []).map((g: CatalogRow) => g.grantee)]);
    security.push(`REVOKE ALL ON ${routineKind(fn)} ${signature(fn)} FROM ${[...reset].map(role).join(", ")};`);
    for (const grant of fn.grants ?? []) security.push(`GRANT ${privilege(grant.privilege)} ON ${routineKind(fn)} ${signature(fn)} TO ${role(grant.grantee)}${grantOption(grant)};`);
  }
  for (const schema of [...schemas].sort()) {
    const grants = rows(catalog, "schemaGrants").filter(g => g.schema === schema);
    if (!grants.length) continue;
    security.push(`REVOKE ALL ON SCHEMA ${q(schema)} FROM ${[...new Set(["PUBLIC", ...grants.map(g => g.grantee)])].map(role).join(", ")};`);
    for (const grant of grants) security.push(`GRANT ${privilege(grant.privilege)} ON SCHEMA ${q(schema)} TO ${role(grant.grantee)}${grantOption(grant)};`);
  }
  const relationGroups = new Map<string, CatalogRow[]>();
  for (const grant of rows(catalog, "relationGrants")) {
    const key = `${grant.schema}.${grant.relation}`;
    relationGroups.set(key, [...(relationGroups.get(key) ?? []), grant]);
  }
  for (const grants of relationGroups.values()) {
    const first = grants[0];
    const kind = sequences.some(s => s.schemaname === first.schema && s.sequencename === first.relation) ? "SEQUENCE" : "TABLE";
    const name = relation(first.schema, first.relation);
    security.push(`REVOKE ALL ON ${kind} ${name} FROM ${[...new Set(["PUBLIC", ...grants.map(g => g.grantee)])].map(role).join(", ")};`);
    for (const grant of grants) security.push(`GRANT ${privilege(grant.privilege)} ON ${kind} ${name} TO ${role(grant.grantee)}${grantOption(grant)};`);
  }
  for (const grant of rows(catalog, "columnGrants")) security.push(`GRANT ${privilege(grant.privilege)} (${q(grant.column_name)}) ON TABLE ${relation(grant.schema, grant.table_name)} TO ${role(grant.grantee)}${grantOption(grant)};`);
  const defaultKinds: Record<string, string> = { r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS", T: "TYPES", n: "SCHEMAS" };
  for (const grant of rows(catalog, "defaultGrants")) {
    const kind = defaultKinds[grant.object_type];
    if (!kind) throw new Error("Unsupported default privilege object type");
    security.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${q(grant.owner)}${grant.schema ? ` IN SCHEMA ${q(grant.schema)}` : ""} GRANT ${privilege(grant.privilege)} ON ${kind} TO ${role(grant.grantee)}${grantOption(grant)};`);
  }
  for (const publication of rows(catalog, "publications")) {
    const targets = (publication.tables ?? []).map((t: CatalogRow) => relation(t.schema, t.table));
    security.push(`CREATE PUBLICATION ${q(publication.pubname)}${publication.puballtables ? " FOR ALL TABLES" : targets.length ? ` FOR TABLE ${targets.join(", ")}` : ""};`);
  }
  const stages = { base, constraints, security };
  if (options.phase && !(options.phase in stages)) throw new Error("Unknown baseline phase");
  return options.phase ? stages[options.phase] : [...base, ...constraints, ...security];
}

export function migrationBody(sql: string): string {
  const body = sql.replace(/^\uFEFF/, "").trim();
  const opening = /^(\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*)BEGIN(?:\s+TRANSACTION|\s+WORK)?\s*;/i;
  if (!opening.test(body)) return body;
  if (!/\bCOMMIT(?:\s+TRANSACTION|\s+WORK)?\s*;\s*$/i.test(body)) throw new Error("Incomplete migration transaction envelope");
  return body.replace(opening, "$1").replace(/\bCOMMIT(?:\s+TRANSACTION|\s+WORK)?\s*;\s*$/i, "").trim();
}

export function assertMigrationInventory(files: string[]): string[] {
  if (files.length !== 19) throw new Error("Expected exactly 19 release migrations");
  const version = (file: string) => {
    const match = file.split(/[\\/]/).at(-1)?.match(/^(20261005\d{6})_[a-z0-9_]+\.sql$/);
    if (!match) throw new Error("Unexpected release migration filename");
    return match[1];
  };
  const versions = files.map(version);
  if (new Set(versions).size !== versions.length) throw new Error("Duplicated release migration version");
  return [...files].sort((a, b) => version(a).localeCompare(version(b)));
}

export function rowFingerprintSql(catalog: BaselineCatalog, schema: string, table: string): string {
  const columns = rows(catalog, "columns").filter(c => c.schema === schema && c.table_name === table);
  if (!columns.length) throw new Error("Missing original source columns for fingerprint");
  const cryptoSchema = rows(catalog, "extensions").find(e => e.name === "pgcrypto")?.schema ?? "extensions";
  const digest = `${q(cryptoSchema)}.digest`;
  return `select count(*)::text row_count, encode(${digest}(coalesce(string_agg(row_hash, '' order by row_hash), ''), 'sha256'), 'hex') sha256 from (select encode(${digest}(to_jsonb(original)::text, 'sha256'), 'hex') row_hash from (select ${columns.map(c => q(c.name)).join(", ")} from ${relation(schema, table)}) original) hashed`;
}
