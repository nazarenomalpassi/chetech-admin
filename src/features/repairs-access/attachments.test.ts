import { describe, expect, it } from "vitest";
import { validateRepairImage } from "./attachments";

describe("fotos privadas de reparaciones", () => {
  it("rechaza un archivo que dice ser imagen pero contiene texto", () => {
    expect(() => validateRepairImage(new TextEncoder().encode("<script>alert(1)</script>"), "image/png")).toThrow();
  });
  it("acepta jpeg con cabecera valida y limita el tamaño", () => {
    expect(validateRepairImage(new Uint8Array([255,216,255,224,0,0,0,0]), "image/jpeg")).toBe("jpg");
    expect(() => validateRepairImage(new Uint8Array(9 * 1024 * 1024), "image/jpeg")).toThrow();
  });
});
