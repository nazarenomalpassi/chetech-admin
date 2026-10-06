import { describe, expect, it } from "vitest";

import { validatePaymentAllocation } from "@/lib/payment-validation";

describe("validatePaymentAllocation", () => {
  it("acepta pagos repartidos que suman el total", () => {
    const error = validatePaymentAllocation(
      289000,
      [
        { method: "efectivo", amount: 144500 },
        { method: "nx", amount: 144500 }
      ],
      "faltan medios"
    );

    expect(error).toBeNull();
  });

  it("devuelve el mensaje vacio cuando falta un medio de pago", () => {
    const error = validatePaymentAllocation(50000, [], "faltan medios");

    expect(error).toBe("faltan medios");
  });
});
