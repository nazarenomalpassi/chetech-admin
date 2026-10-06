import { describe, expect, it } from "vitest";

import { getLocalDateInputValue, toDisplayDate } from "@/lib/utils";

describe("date utilities", () => {
  it("keeps date-only strings on the same calendar day for display", () => {
    const date = toDisplayDate("2026-05-11");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(11);
  });

  it("keeps UTC-midnight timestamps on the same calendar day for display", () => {
    const date = toDisplayDate("2026-05-11T00:00:00.000+00:00");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(11);
  });

  it("builds the date input value using the local calendar day", () => {
    const value = getLocalDateInputValue(new Date(2026, 4, 11, 15, 30, 0));

    expect(value).toBe("2026-05-11");
  });
});
