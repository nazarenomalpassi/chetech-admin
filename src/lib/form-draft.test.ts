import { describe, expect, it } from "vitest";

import {
  createFormDraftEnvelope,
  hasMeaningfulDraftValue,
  parseFormDraftEnvelope
} from "@/lib/form-draft";

describe("form drafts", () => {
  it("creates a versioned envelope with a stable timestamp", () => {
    const envelope = createFormDraftEnvelope(
      { customerName: "Ana", notes: "Televisor" },
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(envelope).toEqual({
      version: 1,
      updatedAt: "2026-07-13T12:00:00.000Z",
      data: { customerName: "Ana", notes: "Televisor" }
    });
  });

  it("rejects malformed, future-version, and expired drafts", () => {
    const now = new Date("2026-07-13T12:00:00.000Z").getTime();
    const expired = JSON.stringify({
      version: 1,
      updatedAt: "2026-06-01T12:00:00.000Z",
      data: { customerName: "Viejo" }
    });

    expect(parseFormDraftEnvelope("{", { now })).toBeNull();
    expect(parseFormDraftEnvelope(JSON.stringify({ version: 2, updatedAt: new Date(now).toISOString(), data: {} }), { now })).toBeNull();
    expect(parseFormDraftEnvelope(expired, { maxAgeMs: 7 * 86_400_000, now })).toBeNull();
  });

  it("accepts a recent valid draft and detects meaningful nested values", () => {
    const now = new Date("2026-07-13T12:00:00.000Z").getTime();
    const raw = JSON.stringify({
      version: 1,
      updatedAt: "2026-07-13T11:58:00.000Z",
      data: { customerName: "", cart: [{ productId: "product-1", quantity: 1 }], total: 0 }
    });

    const parsed = parseFormDraftEnvelope(raw, { now });

    expect(parsed?.data).toEqual({
      customerName: "",
      cart: [{ productId: "product-1", quantity: 1 }],
      total: 0
    });
    expect(hasMeaningfulDraftValue(parsed?.data)).toBe(true);
    expect(hasMeaningfulDraftValue({ name: "   ", amount: 0, rows: [], active: false })).toBe(false);
  });
});
