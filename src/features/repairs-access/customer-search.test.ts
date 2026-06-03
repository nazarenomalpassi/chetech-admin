import assert from "node:assert/strict";

import { buildRepairAccessCustomerSearchFilters, normalizeRepairAccessLookup } from "@/features/repairs-access/customer-search";

assert.equal(normalizeRepairAccessLookup("  Pérez, Juan!! "), "perez juan");
assert.deepEqual(buildRepairAccessCustomerSearchFilters("ma"), ["full_name.ilike.%ma%", "full_name_normalized.ilike.%ma%"]);
assert.deepEqual(buildRepairAccessCustomerSearchFilters("3571 573744"), [
  "full_name.ilike.%3571 573744%",
  "full_name_normalized.ilike.%3571 573744%",
  "phone.ilike.%3571573744%",
  "alternate_phone.ilike.%3571573744%",
  "dni.ilike.%3571573744%",
  "phone_normalized.ilike.%3571573744%",
  "alternate_phone_normalized.ilike.%3571573744%"
]);
assert.deepEqual(buildRepairAccessCustomerSearchFilters("m,al%p"), ["full_name.ilike.%m al p%", "full_name_normalized.ilike.%m al p%"]);
assert.deepEqual(buildRepairAccessCustomerSearchFilters("Pérez"), ["full_name.ilike.%perez%", "full_name_normalized.ilike.%perez%"]);

console.log("repair access customer search helpers ok");
