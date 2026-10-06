import { describe, expect, it } from "vitest";
import { readRepairPaymentTiming } from "./payment-timing";
describe("repair payment timing", () => {
  it("preserves exact supplied business timestamps and derives their Argentina date", () => {
    expect(readRepairPaymentTiming("2026-04-16T02:21:01.223Z")).toEqual({ paymentDate: "2026-04-15", paymentTimestamp: "2026-04-16T02:21:01.223Z" });
  });
  it("retains date-only input without claiming an exact historic time", () => {
    expect(readRepairPaymentTiming("2026-04-16")).toEqual({ paymentDate: "2026-04-16", paymentTimestamp: undefined });
    expect(readRepairPaymentTiming("2026-04-16", "2026-04-16T11:21:01.223-03:00")).toEqual({ paymentDate: "2026-04-16", paymentTimestamp: "2026-04-16T11:21:01.223-03:00" });
  });
});
