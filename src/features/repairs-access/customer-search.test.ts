import { describe, expect, it } from "vitest";

import { buildRepairAccessCustomerSearchFilters, normalizeRepairAccessLookup } from "./customer-search";

describe("repair access customer search", () => {
  it("normalizes names so imported Access customers can be found while typing", () => {
    expect(normalizeRepairAccessLookup("  Pérez, Juan 3571-573744 ")).toBe("perez juan 3571 573744");
    expect(normalizeRepairAccessLookup("  P\u00e9rez, Juan!! ")).toBe("perez juan");
  });

  it("builds indexed filters for name, phone and DNI searches", () => {
    const filters = buildRepairAccessCustomerSearchFilters("Malp 3571");

    expect(filters).toContain("full_name.ilike.%malp 3571%");
    expect(filters).toContain("full_name_normalized.ilike.%malp 3571%");
    expect(filters).toContain("phone_normalized.ilike.%3571%");
    expect(new Set(filters).size).toBe(filters.length);
  });

  it("builds stable filters for simple names and phone-like values", () => {
    expect(buildRepairAccessCustomerSearchFilters("ma")).toEqual([
      "full_name.ilike.%ma%",
      "full_name_normalized.ilike.%ma%"
    ]);
    expect(buildRepairAccessCustomerSearchFilters("3571 573744")).toEqual([
      "full_name.ilike.%3571 573744%",
      "full_name_normalized.ilike.%3571 573744%",
      "phone.ilike.%3571573744%",
      "alternate_phone.ilike.%3571573744%",
      "dni.ilike.%3571573744%",
      "phone_normalized.ilike.%3571573744%",
      "alternate_phone_normalized.ilike.%3571573744%"
    ]);
    expect(buildRepairAccessCustomerSearchFilters("m,al%p")).toEqual([
      "full_name.ilike.%m al p%",
      "full_name_normalized.ilike.%m al p%"
    ]);
    expect(buildRepairAccessCustomerSearchFilters("P\u00e9rez")).toEqual([
      "full_name.ilike.%perez%",
      "full_name_normalized.ilike.%perez%"
    ]);
  });

  it("does not query Supabase for one-character noise", () => {
    expect(buildRepairAccessCustomerSearchFilters("m")).toEqual([]);
  });
});
