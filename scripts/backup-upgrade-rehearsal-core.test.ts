import { describe, expect, it } from "vitest";
import { buildBaselineStatements, migrationBody, assertMigrationInventory, rowFingerprintSql } from "./backup-upgrade-rehearsal-core";

const catalog: any = { tables: [{ schema: "public", name: "orders", kind: "r", rls: true, forceRls: false, owner: "postgres" }], columns: [{ schema: "public", table_name: "orders", name: "id", type: "uuid", not_null: true }, { schema: "public", table_name: "orders", name: "amount", type: "numeric", generated: "s", default_expression: "public.calculate_amount()" }], functions: [{ schema: "public", name: "calculate_amount", arguments: "", owner: "postgres", definition: "CREATE FUNCTION public.calculate_amount() RETURNS numeric LANGUAGE sql AS $$ SELECT 0 $$;", grants: [{ grantee: "authenticated", privilege: "EXECUTE" }] }], triggers: [{ schema: "public", table_name: "orders", name: "portal_publish", enabled: "O", definition: "CREATE TRIGGER portal_publish AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.portal_publish()" }], constraints: [], indexes: [], policies: [{ schema: "public", table_name: "orders", name: "ops", command: "r", permissive: true, roles: ["authenticated"], using_expression: "true" }], extensions: [], enums: [], sequences: [], views: [], relationGrants: [], schemaGrants: [], columnGrants: [], defaultGrants: [], sequenceOwnership: [], publications: [] };

describe("clean production-catalog reconstruction", () => {
  it("creates functions before generated columns and retains the real portal trigger, RLS and grants", () => {
    const sql = buildBaselineStatements(catalog).join("\n");
    expect(sql.indexOf("CREATE FUNCTION public.calculate_amount")).toBeLessThan(sql.indexOf("GENERATED ALWAYS AS"));
    expect(sql).toContain("CREATE TRIGGER portal_publish");
    expect(sql).toContain('ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "ops"');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION "public"."calculate_amount"() TO "authenticated"');
  });
  it("only strips migration transaction envelopes, never PL/pgSQL bodies", () => {
    const body = "create function f() returns void language plpgsql as $$ begin perform 1; end $$;";
    expect(migrationBody(`begin;\n${body}\ncommit;`)).toBe(body);
    expect(migrationBody(body)).toBe(body);
  });
  it("requires exactly 19 release migrations, with no duplicated version", () => {
    expect(() => assertMigrationInventory(["20261005194618_x.sql"])).toThrow(/19/);
    const files = Array.from({ length: 19 }, (_, n) => `20261005${String(194600 + n).padStart(6, "0")}_x.sql`);
    expect(assertMigrationInventory(files)).toHaveLength(19);
    expect(() => assertMigrationInventory([...files.slice(0, 18), files[0]])).toThrow(/duplicat/i);
  });
  it("fingerprints the original source columns, so additive columns cannot hide old-row changes", () => {
    const sql = rowFingerprintSql(catalog, "public", "orders");
    expect(sql).toContain('select "id", "amount" from "public"."orders"');
    expect(sql).toContain("sha256");
    expect(sql).not.toContain("select *");
  });
});
