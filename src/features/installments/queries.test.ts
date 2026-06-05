import { describe, expect, it } from "vitest";

import { isInstallmentsUnavailableError } from "@/features/installments/queries";

describe("isInstallmentsUnavailableError", () => {
  it("treats permission denied on installments as unavailable dashboard data", () => {
    expect(isInstallmentsUnavailableError({ message: "permission denied for table installments" })).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isInstallmentsUnavailableError({ message: "network timeout" })).toBe(false);
  });
});
