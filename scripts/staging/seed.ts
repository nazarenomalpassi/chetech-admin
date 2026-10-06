import { IDENTITIES, LOCAL } from "./config";
import type { Database } from "./db";

export const FIXTURES = {
  customer: "c5100500-0000-4000-8000-000000000010",
  device: "c5100500-0000-4000-8000-000000000020",
  product: "c5100500-0000-4000-8000-000000000030",
  order: "c5100500-0000-4000-8000-000000000040",
  newOrder: "c5100500-0000-4000-8000-000000000041"
};

export async function seed(db: Database) {
  await db.query("begin");
  try {
    await db.query("select pg_advisory_xact_lock(510052026)");
    for (const identity of IDENTITIES) {
      const collision = await db.query("select id,email from auth.users where id=$1 or email=$2", [identity.id, identity.email]);
      if (collision.rows.some((u) => u.id !== identity.id || u.email !== identity.email)) throw new Error("Synthetic auth identity collision; refusing overwrite");
      const profile = await db.query("select role,full_name from public.profiles where id=$1", [identity.id]);
      if (profile.rows.some((p) => p.role !== identity.role || p.full_name !== identity.name)) throw new Error("Synthetic profile collision; refusing overwrite");
      await db.query("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3,$4) on conflict(id) do nothing", [identity.id, identity.email,
        JSON.stringify({ provider: "email", providers: ["email"], role: identity.role, staging: true }), JSON.stringify({ full_name: identity.name })]);
      await db.query("insert into public.profiles(id,email,full_name,role,email_verified) values($1,$2,$3,$4,true) on conflict(id) do nothing", [identity.id, identity.email, identity.name, identity.role]);
    }
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: IDENTITIES[0].id, role: "authenticated" })]);
    for (const [table, id, column] of [
      ["repair_access_customers", FIXTURES.customer, "notes"], ["repair_access_devices", FIXTURES.device, "notes"],
      ["products", FIXTURES.product, "notes"], ["repair_access_orders", FIXTURES.order, "notes"], ["repair_access_orders", FIXTURES.newOrder, "notes"]]) {
      const existing = await db.query(`select ${column} tag from public.${table} where id=$1`, [id]);
      if (existing.rows.some((r) => !String(r.tag).includes(LOCAL.fixtureTag))) throw new Error(`Fixture ID collision in ${table}; refusing overwrite`);
    }
    await db.query("insert into public.repair_access_customers(id,full_name,phone,email,notes,created_by) values($1,$2,'3510000000','customer@staging.invalid',$2,$3) on conflict(id) do nothing", [FIXTURES.customer, LOCAL.fixtureTag + " Cliente sintetico", IDENTITIES[0].id]);
    await db.query("insert into public.repair_access_devices(id,customer_id,device_type,brand,model,notes) values($1,$2,'Televisor','STAGING','TV-SYNTHETIC',$3) on conflict(id) do nothing", [FIXTURES.device, FIXTURES.customer, LOCAL.fixtureTag]);
    await db.query("insert into public.products(id,sku,name,cost,sale_price,stock,notes) values($1,'STAGING-20261005-PART',$2,1000,2500,100,$3) on conflict(id) do nothing", [FIXTURES.product, LOCAL.fixtureTag + " Fuente sintetica", LOCAL.fixtureTag]);
    for (const [id, status, budget] of [[FIXTURES.order, "presupuestado", 100000], [FIXTURES.newOrder, "pendiente_revision", null]]) {
      await db.query("insert into public.repair_access_orders(id,customer_id,device_id,issue_reported,budget_amount,budget_detail,status,notes,technician_id,created_by,physical_location) values($1,$2,$3,$4,$5,'Fuente y mano de obra',$6,$7,$8,$9,'STAGING estante A') on conflict(id) do nothing", [id, FIXTURES.customer, FIXTURES.device, LOCAL.fixtureTag + " No enciende (new order)", budget, status, LOCAL.fixtureTag, IDENTITIES[1].id, IDENTITIES[0].id]);
    }
    await db.query("commit");
    console.log("Seed ready (additive, existing fixture state preserved):", FIXTURES);
  } catch (e) { await db.query("rollback"); throw e; }
}
