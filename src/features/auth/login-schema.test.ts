import { describe, expect, it } from "vitest";

import { getLoginErrorMessage, loginSchema } from "@/features/auth/login-schema";

describe("loginSchema", () => {
  it("valida un login correcto", () => {
    const result = loginSchema.safeParse({
      email: "admin@chetech.com",
      password: "123456"
    });

    expect(result.success).toBe(true);
  });

  it("muestra un mensaje claro para credenciales invalidas", () => {
    expect(getLoginErrorMessage("Invalid login credentials")).toBe("Email o contraseña incorrectos.");
  });
});
