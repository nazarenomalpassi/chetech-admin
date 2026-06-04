import { describe, expect, it } from "vitest";

import { buildRepairAccessCustomerSearchFilters, normalizeRepairAccessLookup } from "@/features/repairs-access/customer-search";

describe("repair access customer search helpers", () => {
  it("normalizes names and builds filters", () => {
    expect(normalizeRepairAccessLookup("  P\u00e9rez, Juan!! ")).toBe("perez juan");
    expect(buildRepairAccessCustomerSearchFilters("ma")).toEqual(["full_name.ilike.%ma%", "full_name_normalized.ilike.%ma%"]);
    expect(buildRepairAccessCustomerSearchFilters("3571 573744")).toEqual([
      "full_name.ilike.%3571 573744%",
      "full_name_normalized.ilike.%3571 573744%",
      "phone.ilike.%3571573744%",
      "alternate_phone.ilike.%3571573744%",
      "dni.ilike.%3571573744%",
      "phone_normalized.ilike.%3571573744%",
      "alternate_phone_normalized.ilike.%3571573744%"
    ]);
    expect(buildRepairAccessCustomerSearchFilters("m,al%p")).toEqual(["full_name.ilike.%m al p%", "full_name_normalized.ilike.%m al p%"]);
    expect(buildRepairAccessCustomerSearchFilters("P\u00e9rez")).toEqual(["full_name.ilike.%perez%", "full_name_normalized.ilike.%perez%"]);
  });
});
