import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { LOCAL, assertLocalUrl } from "./config";

type Result = { rows: Record<string, any>[]; rowCount: number };
export type Database = { query(sql: string, values?: unknown[]): Promise<Result>; end(): Promise<void> };
const { Client } = createRequire(import.meta.url)("pg") as { Client: new (config: object) => Database & { connect(): Promise<void> } };

export function docker(args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function verifyContainer() {
  const context = JSON.parse(docker(["context", "inspect"]))[0];
  const endpoint = process.env.DOCKER_HOST || context.Endpoints.docker.Host;
  if (!/^(npipe:\/\/|unix:\/\/)/.test(endpoint)) throw new Error("Refusing a nonlocal Docker daemon");
  const data = JSON.parse(docker(["inspect", LOCAL.databaseContainer]))[0];
  const bindings = data.NetworkSettings.Ports["5432/tcp"];
  if (!data.State.Running || !bindings?.length || bindings.some((p: any) => p.HostIp !== "127.0.0.1" || p.HostPort !== "54339")) {
    throw new Error("Prepared staging container must run with ONLY 127.0.0.1:54339 for PostgreSQL");
  }
}

export async function connectDatabase(): Promise<Database> {
  assertLocalUrl(LOCAL.databaseUrl, "database");
  verifyContainer();
  const client = new Client({ connectionString: LOCAL.databaseUrl, connectionTimeoutMillis: 5000, application_name: "chetech-local-staging-harness" });
  await client.connect();
  try {
    const { rows } = await client.query("select current_database() name, current_setting('server_version_num')::integer version");
    if (rows[0].name !== LOCAL.database || rows[0].version < 170000 || rows[0].version >= 180000) {
      throw new Error("Refusing a database other than prepared PostgreSQL 17 chetech_staging");
    }
    return client;
  } catch (e) { await client.end(); throw e; }
}

export async function bootstrap(db: Database) {
  await db.query(readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
}
