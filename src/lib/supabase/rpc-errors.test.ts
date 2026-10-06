import { describe, expect, it } from "vitest";

import { getFriendlyDatabaseError, isMissingDatabaseFunctionError } from "@/lib/supabase/rpc-errors";

describe("Supabase RPC errors", () => {
  it("detects PostgREST and PostgreSQL missing function errors", () => {
    expect(isMissingDatabaseFunctionError({ code: "PGRST202", message: "function not found" }, "save_sale_atomic")).toBe(true);
    expect(isMissingDatabaseFunctionError({ code: "42883", message: "function save_sale_atomic does not exist" }, "save_sale_atomic")).toBe(true);
    expect(isMissingDatabaseFunctionError({ code: "23514", message: "stock" }, "save_sale_atomic")).toBe(false);
  });

  it("maps expected database errors to operator-friendly messages", () => {
    expect(getFriendlyDatabaseError({ code: "23505", message: "duplicate key" }, "No se pudo guardar.")).toBe(
      "Ya existe un registro con esos datos."
    );
    expect(getFriendlyDatabaseError({ message: "Stock insuficiente para Teclado." }, "No se pudo guardar.")).toBe(
      "Stock insuficiente para Teclado."
    );
    expect(getFriendlyDatabaseError({ message: "internal postgres syntax" }, "No se pudo guardar.")).toBe(
      "No se pudo guardar."
    );
  });

  it.each([
    ["Registra una autorizacion vigente del cliente antes de marcar listo para retirar.", "Cliente confirmo"],
    ["Completa el control de calidad antes de marcar listo para retirar.", "casilla de verificacion"],
    ["Completa o cancela los repuestos pendientes antes de marcar listo para retirar.", "recepcion"]
  ])("explains the blocked pickup transition: %s", (message, instruction) => {
    expect(getFriendlyDatabaseError({ code: "23514", message }, "No se pudo guardar el seguimiento.")).toContain(instruction);
  });

  it("does not expose unexpected database constraint details", () => {
    expect(getFriendlyDatabaseError({ code: "23514", message: 'new row violates check constraint "private_table_rule"' }, "No se pudo guardar.")).toBe("No se pudo guardar.");
  });
});
