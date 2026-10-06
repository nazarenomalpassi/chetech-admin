import { describe, expect, it } from "vitest";
import { assertFiscalOrigin, readFiscalJson } from "./request-security";

describe("manual confirm request security", () => {
  it("requires same-origin JSON requests and rejects missing or foreign origins", () => {
    expect(() => assertFiscalOrigin(new Request("https://app.test/api/fiscal/confirm", { method: "POST", headers: { Origin: "https://app.test", "Content-Type": "application/json" } }))).not.toThrow();
    for (const origin of ["https://evil.test", "null", ""]) {
      expect(() => assertFiscalOrigin(new Request("https://app.test/api/fiscal/confirm", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" } }))).toThrow();
    }
  });
  it("caps JSON bodies and does not accept malformed JSON", async () => {
    await expect(readFiscalJson(new Request("https://app.test", { method: "POST", body: "{" }))).rejects.toThrow();
    await expect(readFiscalJson(new Request("https://app.test", { method: "POST", body: "x".repeat(17000) }))).rejects.toThrow();
  });
});
