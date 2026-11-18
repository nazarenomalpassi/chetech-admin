#!/usr/bin/env node
// Arranca un comando con la clave pública de la base de Railway ya calculada.
//
// La base de Railway deriva todas sus claves de un único ROOT_SECRET (ver
// github.com/6ixfalls/supabase, paquete secrets). Este script repite esa misma
// derivación dentro de Railway, así la clave anónima nunca se copia a mano ni
// pasa por nadie: el servicio de la aplicación solo recibe SUPABASE_ROOT_SECRET
// como referencia a la variable del panel.
//
// Uso: node scripts/railway/with-supabase-keys.mjs npm run build
// Sin SUPABASE_ROOT_SECRET (por ejemplo en desarrollo local) ejecuta el comando sin tocar nada.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";

const DERIVATION_VERSION = "supabase-secrets/v1";
const ISSUED_AT = 1_700_000_000;
const EXPIRES_AT = 4_102_444_800;

export function deriveBytes(rootSecret, label, length) {
  const prk = createHmac("sha256", DERIVATION_VERSION).update(rootSecret).digest();
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  for (let counter = 1; output.length < length; counter += 1) {
    previous = createHmac("sha256", prk)
      .update(previous)
      .update(label)
      .update(Buffer.from([counter]))
      .digest();
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}

const base64Url = (value) => Buffer.from(value).toString("base64url");

export function deriveRoleKey(rootSecret, role) {
  if (Buffer.byteLength(rootSecret) < 32)
    throw new Error("ROOT_SECRET debe tener al menos 32 bytes");
  const jwtSecret = deriveBytes(rootSecret, "jwt-secret", 30).toString("base64");
  const header = base64Url('{"alg":"HS256","typ":"JWT"}');
  const body = base64Url(
    JSON.stringify({ role, iss: "supabase", iat: ISSUED_AT, exp: EXPIRES_AT })
  );
  const content = `${header}.${body}`;
  const signature = createHmac("sha256", jwtSecret).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function main(argv) {
  const command = argv.slice(2);
  if (command.length === 0) {
    console.error("Uso: node scripts/railway/with-supabase-keys.mjs <comando> [argumentos]");
    process.exit(2);
  }
  const env = { ...process.env };
  const rootSecret = env.SUPABASE_ROOT_SECRET;
  if (rootSecret) {
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = deriveRoleKey(rootSecret, "anon");
    delete env.SUPABASE_ROOT_SECRET;
  }
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", env });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
