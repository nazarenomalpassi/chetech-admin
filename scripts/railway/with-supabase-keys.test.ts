import { describe, expect, it } from "vitest";

// @ts-expect-error módulo de Node sin tipos, se ejecuta tal cual en Railway
import { deriveRoleKey } from "./with-supabase-keys.mjs";

// Vector calculado con la implementación original en Go (6ixfalls/supabase, secrets.Derive)
// a partir de un secreto de prueba. Si cambia, la aplicación dejaría de entrar a la base.
const ROOT = "prueba-de-derivacion-con-al-menos-treinta-y-dos-bytes";

describe("clave anónima de la base de Railway", () => {
  it("se deriva igual que en los servicios de la base", () => {
    expect(deriveRoleKey(ROOT, "anon")).toBe(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.58wEo-_WCbMd1UBYc-SjtJHeka38pWuDq11UHyXAOoE"
    );
  });

  it("rechaza un secreto demasiado corto", () => {
    expect(() => deriveRoleKey("corto", "anon")).toThrow(/32 bytes/);
  });
});
