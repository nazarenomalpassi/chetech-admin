/**
 * Genera src/lib/db/database.types.ts desde el esquema public de Supabase.
 * Uso: SUPABASE_ACCESS_TOKEN="..." npm run db:types
 * El proyecto se toma de SUPABASE_PROJECT_ID o de NEXT_PUBLIC_SUPABASE_URL.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function projectRef() {
  if (process.env.SUPABASE_PROJECT_ID) return process.env.SUPABASE_PROJECT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const match = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (match) return match[1];
  throw new Error("Definí SUPABASE_PROJECT_ID o NEXT_PUBLIC_SUPABASE_URL.");
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("Falta SUPABASE_ACCESS_TOKEN (token personal de Supabase).");
  process.exit(1);
}

const output = execFileSync(
  "npx",
  [
    "--yes",
    "supabase@latest",
    "gen",
    "types",
    "typescript",
    "--project-id",
    projectRef(),
    "--schema",
    "public"
  ],
  { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 }
);
writeFileSync("src/lib/db/database.types.ts", output);
console.log("Tipos generados en src/lib/db/database.types.ts.");
