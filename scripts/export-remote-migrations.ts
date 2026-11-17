/**
 * Exporta el historial de migraciones registrado en producción a supabase/migrations-remote/.
 * Uso: SUPABASE_DB_URL="postgresql://..." npm run db:export-migrations
 * Solo lee supabase_migrations.schema_migrations. No escribe en la base.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const outDir = path.resolve("supabase/migrations-remote");

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Falta SUPABASE_DB_URL con la conexión directa a la base.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin read only");
    const { rows } = await client.query<{
      version: string;
      name: string;
      statements: string[] | null;
    }>(
      "select version, name, statements from supabase_migrations.schema_migrations order by version"
    );
    await mkdir(outDir, { recursive: true });
    for (const row of rows) {
      const safeName = row.name.replace(/[^a-z0-9_]+/gi, "_");
      const body = (row.statements ?? []).join("\n;\n");
      await writeFile(path.join(outDir, `${row.version}_${safeName}.sql`), `${body}\n`, {
        flag: "w"
      });
    }
    console.log(
      `${rows.length} migraciones exportadas en ${path.relative(process.cwd(), outDir)}.`
    );
    console.log("Revisalas antes de commitear: el repo es público.");
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
