import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const container = process.env.CHETECH_WORKSHOP_TEST_CONTAINER;
const suite = container ? describe : describe.skip;
suite("complete intake on isolated PostgreSQL", () => {
  it("persists color, retains old fields and financial history, supports older clients and normalized global search", () => {
    if (container !== "chetech-staging-20261005") throw new Error("Only the isolated workshop staging container is allowed.");
    const migration = readFileSync("supabase/migrations/20261007133924_workshop_intake_color_search.sql", "utf8");
    const checks = readFileSync("scripts/workshop-intake-color.integration.sql", "utf8");
    const output = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "chetech_staging", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      // The local function importer omits ACLs; reproduce the existing production ACL in this rollback.
      input: `begin;\nrevoke all on function public.save_repair_access_intake(jsonb) from public,anon;\ngrant execute on function public.save_repair_access_intake(jsonb) to authenticated,service_role;\n${migration}\n${checks}\nrollback;\nselect 'complete intake and search rollback verified';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
    });
    expect(output.trim()).toBe("complete intake and search rollback verified");
  });
});
