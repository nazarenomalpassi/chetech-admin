import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectDatabase } from "../../../scripts/staging/db";

const migration = readFileSync("supabase/migrations/20261005205842_expenses_linked_parts_commitments.sql", "utf8");
const suite = process.env.CHETECH_EXPENSES_STAGING === "1" ? describe : describe.skip;
suite("expense linkage on local PostgreSQL 17 with RLS", () => {
  it("links actual payments without changing cash, deducts only known outstanding purchases and replays once", async () => {
    const db = await connectDatabase();
    try {
      await db.query("begin");
      const ready = await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='part_request_id') as installed");
      if (!ready.rows[0].installed) await db.query(migration);
      await db.query("set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000001'");
      const baseline = (await db.query("select public.get_purchase_commitments_snapshot() as snapshot")).rows[0].snapshot;
      await db.query(`
        set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000001';
        do $$ declare c uuid; d uuid; o uuid; p uuid; u uuid; s uuid; begin
          insert into public.repair_access_customers(full_name) values ('Expense fixture') returning id into c;
          insert into public.repair_access_devices(customer_id,device_type) values(c,'TV') returning id into d;
          insert into public.repair_access_orders(customer_id,device_id,issue_reported) values(c,d,'Expense fixture') returning id into o;
          insert into public.repair_part_requests(operation_id,order_id,description,quantity,status,unit_cost,supplier,buyer_id,requested_by)
            values(gen_random_uuid(),o,'Known purchase',2,'ordered',100,'Supplier',auth.uid(),auth.uid()) returning id into p;
          insert into public.repair_part_requests(operation_id,order_id,description,quantity,status,unit_cost,supplier,buyer_id,requested_by)
            values(gen_random_uuid(),o,'Unknown purchase',1,'installed',null,'Supplier',auth.uid(),auth.uid()) returning id into u;
          insert into public.repair_part_requests(operation_id,order_id,description,quantity,status,unit_cost,requested_by)
            values(gen_random_uuid(),o,'Reserved stock',1,'received',999,auth.uid()) returning id into s;
          perform set_config('fixture.order',o::text,true);
          perform set_config('fixture.part',p::text,true);
          perform set_config('fixture.unknown',u::text,true);
        end $$;
        set local role authenticated;
      `);
      const { rows } = await db.query(`
        select public.save_expense_atomic(null,'2026-10-05','Parts','Already paid',60,'efectivo','No inferred payment') as saved
      `);
      const id = rows[0].saved.id;
      const cash = await db.query("select * from public.movimientos_caja where referencia_id=$1", [id]);
      const before = await db.query("select created_by,created_at,expense_date from public.expenses where id=$1", [id]);
      await db.query("select public.link_expense_purchase_atomic($1,current_setting('fixture.part')::uuid,null,null,null)", [id]);
      expect((await db.query("select count(*)::int as count from public.audit_logs where entity_id=$1 and changes->>'link_only'='true'", [id])).rows[0].count).toBe(1);
      expect((await db.query("select * from public.movimientos_caja where referencia_id=$1", [id])).rows).toEqual(cash.rows);
      expect((await db.query("select created_by,created_at,expense_date from public.expenses where id=$1", [id])).rows).toEqual(before.rows);
      // Repeating a metadata link after a lost response must not duplicate its audit either.
      await db.query("select public.link_expense_purchase_atomic($1,current_setting('fixture.part')::uuid,null,null,null)", [id]);
      const snapshot = async () => {
        const result = await db.query("select public.get_purchase_commitments_snapshot() as snapshot");
        for (const key of ["knownOutstanding", "unknownCostCount", "purchaseCount"]) result.rows[0].snapshot[key] -= baseline[key];
        return result;
      };
      expect((await snapshot()).rows[0].snapshot).toMatchObject({ knownOutstanding: 140, unknownCostCount: 1, purchaseCount: 2 });
      // A direct REP cost never pays down its parts commitment.
      await db.query("select public.link_expense_purchase_atomic($1,null,current_setting('fixture.order')::uuid,current_setting('fixture.order')::uuid,current_setting('fixture.part')::uuid)", [id]);
      expect((await snapshot()).rows[0].snapshot.knownOutstanding).toBe(200);
      await db.query("select public.link_expense_purchase_atomic($1,current_setting('fixture.part')::uuid,null,current_setting('fixture.order')::uuid,null)", [id]);
      await db.query("update public.expenses set is_voided=true where id=$1", [id]);
      expect((await snapshot()).rows[0].snapshot.knownOutstanding).toBe(200);
      await db.query("update public.expenses set is_voided=false where id=$1", [id]);
      const payload = { expenseDate: "2026-10-05", type: "Parts", description: "New payment", amount: 140, paymentMethod: "nx", partRequestId: (await db.query("select current_setting('fixture.part') as id")).rows[0].id };
      const operation = "c5100599-0000-4000-8000-000000000009";
      const saved = await db.query("select public.save_expense_linked_atomic($1,$2::jsonb) as saved", [operation, JSON.stringify(payload)]);
      const replay = await db.query("select public.save_expense_linked_atomic($1,$2::jsonb) as saved", [operation, JSON.stringify(payload)]);
      expect(replay.rows[0].saved.id).toBe(saved.rows[0].saved.id);
      expect((await db.query("select count(*)::int as count from public.movimientos_caja where referencia_id=$1", [saved.rows[0].saved.id])).rows[0].count).toBe(1);
      expect((await snapshot()).rows[0].snapshot.knownOutstanding).toBe(0);
      await db.query("select public.workshop_manage_part(current_setting('fixture.part')::uuid,1,'cancel',0,null,null,null,'Fixture cancelled')");
      await db.query("update public.expenses set is_voided=true where id=$1", [saved.rows[0].saved.id]);
      expect((await snapshot()).rows[0].snapshot.knownOutstanding).toBe(140);
      await db.query("update public.expenses set is_voided=false where id=$1", [saved.rows[0].saved.id]);
      await db.query("savepoint invalid");
      await expect(db.query("select public.save_expense_linked_atomic($1,$2::jsonb)", [operation, JSON.stringify({ ...payload, amount: 141 })])).rejects.toThrow(/reutilizada/i);
      await db.query("rollback to savepoint invalid");
      await expect(db.query("select public.link_expense_purchase_atomic($1,null,null,null,null)", [id])).rejects.toThrow(/cambio/i);
      await db.query("rollback to savepoint invalid");
      await expect(db.query("select public.save_expense_linked_atomic(gen_random_uuid(),$1::jsonb)", [JSON.stringify({ ...payload, partRequestId: "00000000-0000-4000-8000-000000000099" })])).rejects.toThrow();
      await db.query("rollback to savepoint invalid");
      expect((await db.query("select count(*)::int as count from public.expenses where description='New payment'")).rows[0].count).toBe(1);
      const page = (await db.query("select public.get_expense_link_options('part','',1) as page")).rows[0].page;
      expect(page.items.some((x: any) => x.expectedCost === null && x.outstanding === null)).toBe(true);
      await db.query("set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000002'");
      expect((await db.query("select count(*)::int as count from public.expenses")).rows[0].count).toBe(0);
      await expect(snapshot()).rejects.toThrow(/administrador/i);
      await db.query("rollback to savepoint invalid");
      await db.query("set request.jwt.claim.sub='c5100500-0000-4000-8000-000000000002'");
      await expect(db.query("select public.link_expense_purchase_atomic($1,null,null,null,null)", [id])).rejects.toThrow(/administrador/i);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});
