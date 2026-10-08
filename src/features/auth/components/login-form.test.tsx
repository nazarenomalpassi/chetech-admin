// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const login = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/actions", () => ({ loginAction: login }));

beforeEach(() => { vi.stubGlobal("React", React); login.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("login credentials", () => {
  it("uses browser autofill and toggles password visibility without losing or submitting credentials", () => {
    const { container } = render(<LoginForm />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(email.autocomplete).toBe("username");
    expect(password.autocomplete).toBe("current-password");
    fireEvent.change(email, { target: { value: "usuario@example.com" } });
    fireEvent.change(password, { target: { value: "clave-de-prueba" } });
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle.getAttribute("type")).toBe("button");
    fireEvent.click(toggle);
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password.type).toBe("password");
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("email")).toBe("usuario@example.com");
    expect(data.get("password")).toBe("clave-de-prueba");
    expect(login).not.toHaveBeenCalled();
  });
});
