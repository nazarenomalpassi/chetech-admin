import { describe, expect, it } from "vitest";

import { shouldCaptureRepairDraftOnInput } from "@/features/repairs-access/technical-form-events";

describe("shouldCaptureRepairDraftOnInput", () => {
  it("does not capture select input events before the change event", () => {
    expect(shouldCaptureRepairDraftOnInput("SELECT")).toBe(false);
  });

  it("does not capture checkbox input events before the change event", () => {
    expect(shouldCaptureRepairDraftOnInput("INPUT", "checkbox")).toBe(false);
  });

  it("keeps capturing text fields while the technician types", () => {
    expect(shouldCaptureRepairDraftOnInput("INPUT", "text")).toBe(true);
    expect(shouldCaptureRepairDraftOnInput("TEXTAREA")).toBe(true);
  });
});
