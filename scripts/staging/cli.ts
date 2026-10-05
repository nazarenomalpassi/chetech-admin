import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { ANON_KEY, LOCAL, IDENTITIES, nextEnvironment } from "./config";
import { bootstrap, connectDatabase, docker, verifyContainer } from "./db";
import { seed } from "./seed";
import { createStagingServer } from "./server";

async function setup() {
  const db = await connectDatabase();
  try { await bootstrap(db); await seed(db); } finally { await db.end(); }
  const networks = docker(["network", "ls", "--format", "{{.Name}}"]);
  if (!networks.split(/\r?\n/).includes(LOCAL.network)) docker(["network", "create", "--internal", "--label", "chetech.staging=20261005", LOCAL.network]);
  const network = JSON.parse(docker(["network", "inspect", LOCAL.network]))[0];
  if (!network.Internal || network.Labels?.["chetech.staging"] !== "20261005") throw new Error("Refusing an unrelated/noninternal staging network");
  if (!networks.split(/\r?\n/).includes(LOCAL.edgeNetwork)) docker(["network", "create", "--label", "chetech.staging=20261005", LOCAL.edgeNetwork]);
  const edge = JSON.parse(docker(["network", "inspect", LOCAL.edgeNetwork]))[0];
  if (edge.Internal || edge.Labels?.["chetech.staging"] !== "20261005") throw new Error("Refusing an unrelated staging loopback bridge");
  const pg = JSON.parse(docker(["inspect", LOCAL.databaseContainer]))[0];
  if (!pg.NetworkSettings.Networks[LOCAL.network]) docker(["network", "connect", LOCAL.network, LOCAL.databaseContainer]);
  const containers = docker(["ps", "-a", "--format", "{{.Names}}"]);
  if (containers.split(/\r?\n/).includes(LOCAL.restContainer)) {
    const info = JSON.parse(docker(["inspect", LOCAL.restContainer]))[0];
    if (info.Config.Labels?.["chetech.staging"] !== "20261005" || info.Config.Image !== LOCAL.image ||
      !info.NetworkSettings.Networks[LOCAL.network] || info.HostConfig.PortBindings["3000/tcp"]?.some((p: any) => p.HostIp !== "127.0.0.1" || p.HostPort !== "54340")) throw new Error("Refusing an unrelated/unsafe PostgREST container");
    if (!info.NetworkSettings.Networks[LOCAL.edgeNetwork]) {
      docker(["network", "connect", LOCAL.edgeNetwork, LOCAL.restContainer]);
      if (info.State.Running) docker(["restart", LOCAL.restContainer]);
    }
    if (!info.State.Running) docker(["start", LOCAL.restContainer]);
  } else {
    docker(["create", "--name", LOCAL.restContainer, "--label", "chetech.staging=20261005", "--network", LOCAL.edgeNetwork,
      "-p", "127.0.0.1:54340:3000", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "-e", `PGRST_DB_URI=postgres://${LOCAL.authenticator}:${LOCAL.authenticatorPassword}@${LOCAL.databaseContainer}:5432/${LOCAL.database}`,
      "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", "-e", "PGRST_DB_CONFIG=false",
      "-e", `PGRST_JWT_SECRET=${LOCAL.jwtSecret}`, "-e", "PGRST_JWT_AUD=authenticated", "-e", "PGRST_SERVER_PORT=3000", LOCAL.image]);
    docker(["network", "connect", LOCAL.network, LOCAL.restContainer]);
    docker(["start", LOCAL.restContainer]);
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(LOCAL.restUrl + "/", { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (response?.ok) { console.log("PostgREST ready:", LOCAL.restUrl); return; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("PostgREST did not become ready; inspect docker logs " + LOCAL.restContainer);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command !== "app" && args.length) throw new Error("No endpoint overrides are allowed; staging uses fixed loopback endpoints");
  if (command === "env") {
    console.log(JSON.stringify({ ...nextEnvironment(), credentials: IDENTITIES.map((u) => ({ email: u.email, password: LOCAL.password, role: u.role })) }, null, 2)); return;
  }
  if (command === "setup" || command === "start") await setup();
  if (command === "setup") return;
  if (command === "start" || command === "serve") {
    const db = await connectDatabase();
    const server = createStagingServer(db);
    server.on("error", async (e) => { console.error(e.message); await db.end(); process.exitCode = 1; });
    server.listen(54341, "127.0.0.1", () => console.log(`Staging READY ${LOCAL.apiUrl}\nPublic TEST anon JWT: ${ANON_KEY}\nSynthetic users: ${IDENTITIES.map((u) => u.email).join(", ")}\nPassword: ${LOCAL.password}`));
    const stop = () => server.close(() => { void db.end().then(() => process.exit(0)); });
    process.on("SIGINT", stop); process.on("SIGTERM", stop); return;
  }
  if (command === "seed" || command === "reload") {
    const db = await connectDatabase();
    try { if (command === "seed") await seed(db); else { await db.query("notify pgrst, 'reload schema'"); console.log("Requested PostgREST schema reload; no migrations applied"); } } finally { await db.end(); }
    return;
  }
  if (command === "status") {
    verifyContainer();
    const result = await fetch(LOCAL.apiUrl + "/health"); console.log(await result.text());
    if (!result.ok) process.exitCode = 1; return;
  }
  if (command === "stop") {
    verifyContainer();
    const info = JSON.parse(docker(["inspect", LOCAL.restContainer]))[0];
    if (info.Config.Labels?.["chetech.staging"] !== "20261005") throw new Error("Refusing to stop unrelated container");
    docker(["stop", LOCAL.restContainer]); console.log("Stopped only staging PostgREST. Stop auth via Ctrl+C; database/fixtures preserved."); return;
  }
  if (command === "app") {
    if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) throw new Error("Usage: app [--port 3001]");
    const port = args[1] || "3001";
    if (+port < 1024 || +port > 65535 || [54339, 54340, 54341].includes(+port)) throw new Error("Unsafe app port");
    const health = await fetch(LOCAL.apiUrl + "/health", { signal: AbortSignal.timeout(5000) });
    const readiness = await health.json();
    if (!health.ok || readiness.database !== LOCAL.database || !readiness.staging) throw new Error("Start staging before launching Next.js");
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const env: NodeJS.ProcessEnv = { ...process.env, ...nextEnvironment(), CHETECH_LOCAL_STAGING: "1" };
    // Explicit values override Next's .env.local; never print or read that file.
    for (const key of Object.keys(env)) if (/^(AFIP_|ARCA_|FISCAL_|SUPABASE_)/.test(key) && !(key in nextEnvironment())) env[key] = "";
    console.log(`Starting the unchanged Next.js app on http://127.0.0.1:${port} with TEST-ONLY Supabase`);
    const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", port], { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => { process.exitCode = code || 0; }); return;
  }
  if (command !== "help") throw new Error("Unknown staging command");
  console.log("npx tsx scripts/staging/cli.ts <setup|start|serve|seed|reload|status|env|stop|app [--port 3001]>");
}

void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
