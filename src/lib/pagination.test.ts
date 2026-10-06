import { describe, expect, it } from "vitest";

import { buildPaginationHref, getPaginationRange, parsePage } from "@/lib/pagination";

describe("pagination", () => {
  it("normalizes invalid page values to the first page", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("texto")).toBe(1);
    expect(parsePage("3")).toBe(3);
  });

  it("builds inclusive Supabase ranges", () => {
    expect(getPaginationRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(getPaginationRange(3, 25)).toEqual({ from: 50, to: 74 });
  });

  it("preserves filters and removes page one from the URL", () => {
    const params = new URLSearchParams("status=ok&search=cable&page=4");

    expect(buildPaginationHref("/ventas", params, 2)).toBe("/ventas?status=ok&search=cable&page=2");
    expect(buildPaginationHref("/ventas", params, 1)).toBe("/ventas?status=ok&search=cable");
  });
});
