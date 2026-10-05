import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}
describe("public repository fiscal privacy", () => {
  it("keeps only explicitly synthetic taxpayer examples in published fiscal source", () => {
    const allowedSynthetic = new Set(["20123456786", "20123456787"]);
    const files = [...sourceFiles("src/features/fiscal"), ...sourceFiles("src/app/api/fiscal"),
      "docs/operations/arca-fiscal-setup.md", "supabase/migrations/20261005194707_fiscal_issuance_records.sql",
      "supabase/migrations/20261005212551_wsaa_encrypted_ticket_cache.sql"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const unexpectedIds = (source.match(/\b[1-9]\d{10}\b/g) ?? []).filter((value) => !allowedSynthetic.has(value));
      expect(unexpectedIds, file).toEqual([]);
    }
  });
});
