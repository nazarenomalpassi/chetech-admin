import { describe, expect, it } from "vitest";

import { matchesSearchText, normalizeSearchText } from "@/lib/search";

describe("search helpers", () => {
  it("normalizes accents, casing and unsafe filter punctuation", () => {
    expect(normalizeSearchText(" Parlánte, LG (32%) ")).toBe("parlante lg 32");
  });

  it("matches each normalized token without building unsafe Supabase filters", () => {
    expect(matchesSearchText("Parlante Bluetooth JBL", "parlante,jbl")).toBe(true);
    expect(matchesSearchText("Televisor Philips 32", "sony")).toBe(false);
  });
});
