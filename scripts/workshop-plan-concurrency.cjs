/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
"use strict";

// Run: node scripts/workshop-plan-concurrency.cjs
// Parser checks only, without Docker: node scripts/workshop-plan-concurrency.cjs --self-test
// Never applies migrations. Only this exact local container/database is accepted.
// Fixture inserts may consume staging order numbers; sequences are never reset.
const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const CONTAINER = "chetech-plan-validation-20261110";
const DATABASE = "chetech_staging";
const runId = randomUUID();
const marker = `workshop-concurrency:${runId}`;
const adminId = randomUUID();
const customerId = randomUUID();
const deviceId = randomUUID();
const email = `${runId}@workshop-concurrency.invalid`;
const fixtures = [];
const sessions = [];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuidList = (values) => values.map((value) => `${quote(value)}::uuid`).join(",");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rows(output) {
  // A pipe can deliver a JSON row in separate chunks; inspect complete lines only.
  return output.split(/\r?\n/).slice(0, -1).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

function sqlState(stderr) {
  return stderr.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5}):/)?.[1] ?? null;
}

function assertRace(leader, follower) {
  assert.equal(leader.code, 0, `Leader failed: ${leader.stderr}`);
  assert.notEqual(follower.code, 0, "Both sessions succeeded; the conflict was not detected");
  assert.equal(sqlState(follower.stderr), "40001", `Expected SQLSTATE 40001, got: ${follower.stderr}`);
}

function startSql(sql, app, keepOpen = false) {
  const child = spawn("docker", [
    "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "--no-password",
    "--host=/var/run/postgresql", "-U", "postgres", "-d", DATABASE,
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-P", "pager=off"
  ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const session = { child, app, stdout: "", stderr: "", finished: false, done: null };
  sessions.push(session);
  child.stdout.on("data", (data) => { session.stdout += data.toString(); });
  child.stderr.on("data", (data) => { session.stderr += data.toString(); });
  child.stdin.on("error", (error) => { session.stderr += `\nstdin: ${error.message}`; });
  session.done = new Promise((resolve) => {
    child.on("error", (error) => { session.stderr += `\nspawn: ${error.message}`; });
    child.on("close", (code) => {
      session.finished = true;
      resolve({ code, stdout: session.stdout, stderr: session.stderr });
    });
  });
  const prefix = `set application_name=${quote(app)};
    set statement_timeout='20s'; set lock_timeout='12s'; set idle_in_transaction_session_timeout='20s';
    do $$ begin if current_database() <> ${quote(DATABASE)} then raise exception 'Isolated staging only'; end if; end $$;\n`;
  child.stdin.write(prefix + sql + "\n");
  if (!keepOpen) child.stdin.end();
  return session;
}

async function runSql(sql) {
  const session = startSql(sql, `wc-${runId.slice(0, 8)}-control-${sessions.length}`);
  const result = await bounded(session.done, 25000, "SQL control process timed out");
  assert.equal(result.code, 0, result.stderr);
  return rows(result.stdout);
}

async function bounded(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function actor() {
  return `set local role authenticated;
    set local request.jwt.claim.sub=${quote(adminId)};
    set local request.jwt.claims=${quote(JSON.stringify({ sub: adminId, role: "authenticated" }))};`;
}

function rpc(fixture, operation, version, claimId, payload) {
  return `public.workshop_save_supplier_claim(${quote(operation)}::uuid,${quote(fixture.part)}::uuid,
    ${version},${claimId ? `${quote(claimId)}::uuid` : "null"},${quote(JSON.stringify(payload))}::jsonb)`;
}

async function ensureIsolatedTarget() {
  if (process.env.DOCKER_HOST && !/^(npipe|unix):/.test(process.env.DOCKER_HOST)) {
    throw new Error("Refusing a remote DOCKER_HOST");
  }
  const context = await execute("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], { windowsHide: true, timeout: 10000 });
  assert.match(JSON.parse(context.stdout.trim()), /^(npipe|unix):/, "A local Docker context is required");
  const inspect = await execute("docker", ["inspect", CONTAINER], { windowsHide: true, timeout: 10000 });
  const [target] = JSON.parse(inspect.stdout);
  assert.equal(target.Name, `/${CONTAINER}`);
  assert.equal(target.Config.Image, "postgres:17-alpine");
  assert.equal(target.State.Running, true);
  assert.equal(Object.keys(target.HostConfig.PortBindings ?? {}).length, 0, "Isolated container must not publish ports");
  const [db] = await runSql(`select jsonb_build_object('database',current_database(),'rpc',
    to_regprocedure('public.workshop_save_supplier_claim(uuid,uuid,integer,uuid,jsonb)') is not null);`);
  assert.equal(db.database, DATABASE);
  assert.equal(db.rpc, true, "Apply the reviewed migration in the isolated clone before running this test");
}

async function setup() {
  await runSql(`begin;
    insert into auth.users(id,email) values(${quote(adminId)},${quote(email)});
    insert into public.profiles(id,role,full_name) values(${quote(adminId)},'admin',${quote(marker)});
    insert into public.repair_access_customers(id,full_name,phone) values(${quote(customerId)},${quote(marker)},'3510000000');
    insert into public.repair_access_devices(id,customer_id,device_type) values(${quote(deviceId)},${quote(customerId)},'TV synthetic concurrency');
    commit;`);
}

async function state(fixture) {
  const [value] = await runSql(`select jsonb_build_object(
    'order',(select to_jsonb(o) from public.repair_access_orders o where id=${quote(fixture.order)}),
    'part',(select to_jsonb(p)-'version'-'updated_at' from public.repair_part_requests p where id=${quote(fixture.part)}),
    'partVersion',(select version from public.repair_part_requests where id=${quote(fixture.part)}),
    'claims',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.repair_supplier_claims c where part_id=${quote(fixture.part)}),'[]'::jsonb),
    'receipts',(select count(*) from private.workshop_supplier_claim_receipts where operation_id in (${uuidList(fixture.operations)})),
    'events',(select count(*) from public.workshop_events where order_id=${quote(fixture.order)}));`);
  return value;
}

async function createFixture(kind) {
  const fixture = { order: randomUUID(), part: randomUUID(), partOperation: randomUUID(), operations: [randomUUID(), randomUUID(), randomUUID()] };
  fixtures.push(fixture);
  await runSql(`begin;
    insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,status,budget_amount,budget_detail)
      values(${quote(fixture.order)},${quote(customerId)},${quote(deviceId)},${quote(marker)},'presupuestado',100,'Synthetic budget');
    insert into public.repair_part_requests(id,operation_id,order_id,description,quantity,received_quantity,status,requested_by,supplier,unit_cost)
      values(${quote(fixture.part)},${quote(fixture.partOperation)},${quote(fixture.order)},${quote(marker)},1,1,'received',${quote(adminId)},'Synthetic supplier',${kind === "create" ? "null" : "8500.50"});
    ${kind !== "create" ? `${actor()}select ${rpc(fixture, fixture.operations[0], 1, null, { quantity: 1, reason: marker, extra_cost: 8500.50 })};` : ""}
    commit;`);
  return fixture;
}

async function waitForReady(session) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const ready = rows(session.stdout).find((row) => row.stage === "ready");
    if (ready) return ready;
    assert.equal(session.finished, false, `Leader exited before barrier: ${session.stderr}`);
    await delay(25);
  }
  throw new Error("Leader did not reach the open-transaction barrier");
}

async function waitForBlocked(follower, leaderPid) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    assert.equal(follower.finished, false, `Follower exited without overlapping transactions: ${follower.stderr}`);
    const activity = await runSql(`select jsonb_build_object('blocked',${Number(leaderPid)}=any(pg_blocking_pids(pid)))
      from pg_stat_activity where application_name=${quote(follower.app)} and datname=${quote(DATABASE)};`);
    if (activity.some((row) => row.blocked)) return;
    await delay(25);
  }
  throw new Error("Follower never waited for the leader's database lock");
}

async function stopSessions(ownedSessions) {
  const active = ownedSessions.filter((session) => !session.finished);
  if (!active.length) return;
  // Terminate only exact, random per-run application names in the guarded database.
  await runSql(`select jsonb_build_object('terminated',pg_terminate_backend(pid)) from pg_stat_activity
    where datname=${quote(DATABASE)} and pid<>pg_backend_pid()
      and application_name in (${active.map((session) => quote(session.app)).join(",")});`);
  await bounded(Promise.all(active.map((session) => session.done)), 5000, "Owned SQL sessions did not exit");
}

async function runScenario(isolation, kind) {
  const fixture = await createFixture(kind);
  const before = await state(fixture);
  const existing = before.claims[0] ?? null;
  const payload = kind === "create" ? { quantity: 1, reason: marker, extra_cost: null }
    : { status: kind === "resolve-create" ? "resolved" : "sent", resolution: "Synthetic supplier response" };
  const firstCall = rpc(fixture, fixture.operations[1], existing?.version ?? before.partVersion, existing?.id ?? null, payload);
  const secondCall = kind === "update"
    ? rpc(fixture, fixture.operations[2], existing.version, existing.id, { status: "cancelled", resolution: "Synthetic concurrent cancellation" })
    : rpc(fixture, fixture.operations[2], before.partVersion, null, { quantity: 1, reason: marker, extra_cost: null });
  const app = `wc-${runId.slice(0, 8)}-${isolation === "read committed" ? "rc" : "rr"}-${kind}`;
  let leader, follower;
  try {
    leader = startSql(`begin isolation level ${isolation};${actor()}
      select jsonb_build_object('stage','ready','pid',pg_backend_pid(),'result',${firstCall});`, `${app}-leader`, true);
    const ready = await waitForReady(leader);
    follower = startSql(`begin isolation level ${isolation};${actor()}
      select jsonb_build_object('stage','snapshot','count',count(*)) from public.repair_supplier_claims where part_id=${quote(fixture.part)};
      select jsonb_build_object('stage','result','result',${secondCall});commit;`, `${app}-follower`);
    await waitForBlocked(follower, ready.pid);
    leader.child.stdin.end("commit;\n");
    const outcomes = await bounded(Promise.all([leader.done, follower.done]), 15000, "Concurrent SQL processes did not finish");
    assertRace(...outcomes);
    assert.equal(rows(outcomes[1].stdout).find((row) => row.stage === "snapshot")?.count, before.claims.length,
      "Follower did not establish its snapshot before the leader committed");
    const after = await state(fixture);
    assert.deepEqual(after.order, before.order, "Claim changed the original order or its financial fields");
    assert.deepEqual(after.part, before.part, "Claim changed quantity, stock reservation, unit cost or other part data");
    assert.equal(after.partVersion, before.partVersion + 1, "Only the successful mutation may increment part.version");
    assert.equal(after.claims.length, 1, "Failed transaction leaked a second claim");
    assert.equal(after.claims[0].status, kind === "create" ? "open" : payload.status);
    assert.equal(after.claims[0].version, (existing?.version ?? 0) + 1);
    assert.equal(after.claims[0].extra_cost, kind === "create" ? null : 8500.50, "Omitting cost must preserve known cost");
    assert.equal(after.receipts, before.receipts + 1, "Failed transaction wrote an operation receipt");
    assert.equal(after.events, before.events + 1, "Failed transaction wrote an event");
    const activeQuantity = after.claims.filter((claim) => !claim.closed_at).reduce((sum, claim) => sum + claim.quantity, 0);
    assert.ok(activeQuantity <= after.part.received_quantity, "Claims exceed received quantity");
    const replay = await runSql(`begin;${actor()}select jsonb_build_object('result',${firstCall});commit;`);
    assert.equal(replay[0].result.replayed, true);
    assert.deepEqual(await state(fixture), after, "Replay mutated data instead of returning the existing receipt");
    console.log(`PASS ${isolation} / ${kind}: 1 success + 1 SQLSTATE 40001; quantities, order, costs and replay preserved`);
  } finally {
    await stopSessions([leader, follower].filter(Boolean));
  }
}

async function cleanup() {
  await stopSessions([...sessions]);
  const operations = fixtures.flatMap((fixture) => fixture.operations);
  const partIds = fixtures.map((fixture) => fixture.part);
  const orderIds = fixtures.map((fixture) => fixture.order);
  const ownParts = partIds.length ? `select id from public.repair_part_requests where id in (${uuidList(partIds)}) and requested_by=${quote(adminId)} and description=${quote(marker)}` : "select null::uuid where false";
  const ownOrders = orderIds.length ? `select id from public.repair_access_orders where id in (${uuidList(orderIds)}) and customer_id=${quote(customerId)} and issue_reported=${quote(marker)}` : "select null::uuid where false";
  await runSql(`begin;
    ${operations.length ? `delete from private.workshop_supplier_claim_receipts where operation_id in (${uuidList(operations)}) and created_by=${quote(adminId)};` : ""}
    delete from public.repair_supplier_claims where part_id in (${ownParts}) and created_by=${quote(adminId)};
    delete from public.workshop_events where order_id in (${ownOrders}) and actor_id=${quote(adminId)};
    delete from public.repair_part_requests where id in (${ownParts});
    delete from public.repair_access_orders where id in (${ownOrders});
    delete from public.repair_access_devices where id=${quote(deviceId)} and customer_id=${quote(customerId)} and device_type='TV synthetic concurrency';
    delete from public.repair_access_customers where id=${quote(customerId)} and full_name=${quote(marker)};
    delete from public.profiles where id=${quote(adminId)} and full_name=${quote(marker)};
    delete from auth.users where id=${quote(adminId)} and email=${quote(email)};
    commit;`);
  const [remaining] = await runSql(`select jsonb_build_object('users',(select count(*) from auth.users where id=${quote(adminId)}),
    'customers',(select count(*) from public.repair_access_customers where id=${quote(customerId)}),
    'devices',(select count(*) from public.repair_access_devices where id=${quote(deviceId)}),
    'orders',(select count(*) from public.repair_access_orders where id in (${uuidList(orderIds.length ? orderIds : [adminId])})),
    'parts',(select count(*) from public.repair_part_requests where id in (${uuidList(partIds.length ? partIds : [adminId])})),
    'receipts',(select count(*) from private.workshop_supplier_claim_receipts where operation_id in (${uuidList(operations.length ? operations : [adminId])})));`);
  assert.ok(Object.values(remaining).every((count) => count === 0), `Cleanup incomplete: ${JSON.stringify(remaining)}`);
  console.log(`CLEANUP PASS: exact synthetic keys removed (${runId})`);
}

async function main() {
  if (process.argv.length > 2) {
    assert.deepEqual(process.argv.slice(2), ["--self-test"], "No target overrides are accepted");
    assertRace({ code: 0, stderr: "" }, { code: 3, stderr: "ERROR:  40001: serialization failure" });
    assert.throws(() => assertRace({ code: 0 }, { code: 0 }), /Both sessions succeeded/);
    assert.throws(() => assertRace({ code: 0 }, { code: 3, stderr: "ERROR:  23514: invalid quantity" }), /Expected SQLSTATE/);
    assert.equal(sqlState("ERROR:  42501: denied"), "42501");
    assert.equal(sqlState("error without SQLSTATE"), null);
    assert.deepEqual(rows('{"stage":"rea'), []);
    assert.deepEqual(rows('{"stage":"ready"}\n{"stage":"par'), [{ stage: "ready" }]);
    console.log("PASS harness self-test: rejects double success and non-40001 failures; no Docker access");
    return;
  }
  await ensureIsolatedTarget();
  const failures = [];
  try {
    await setup();
    for (const isolation of ["read committed", "repeatable read"]) {
      for (const kind of ["create", "update", "resolve-create"]) {
        try { await runScenario(isolation, kind); }
        catch (error) { failures.push(`${isolation} / ${kind}: ${error.message}`); }
      }
    }
  } finally {
    await cleanup();
  }
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log("PASS all 6 real concurrent scenarios; no migrations, host ports or production access");
}

main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
