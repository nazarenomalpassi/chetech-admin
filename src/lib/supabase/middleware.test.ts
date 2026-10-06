import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { vi } from "vitest";

import {
  getSessionRedirectPath,
  redirectPreservingCookies,
  updateSession
} from "@/lib/supabase/middleware";

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true, getSupabasePublicKey: () => "test-public-key" }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: Array<{ name: string; value: string; options: { path: string } }>) => void } }) => ({
    auth: {
      getSession: async () => {
        options.cookies.setAll([
          { name: "sb-test-auth-token.0", value: "renewed-first-chunk", options: { path: "/" } },
          { name: "sb-test-auth-token.1", value: "renewed-second-chunk", options: { path: "/" } }
        ]);
        return { data: { session: { access_token: "renewed-token" } }, error: null };
      }
    }
  })
}));

describe("updateSession refreshed request", () => {
  it("forwards refreshed cookie chunks to Server Components as well as the browser", async () => {
    const request = new NextRequest("https://chetech-admin.vercel.app/dashboard", {
      headers: { cookie: "sb-test-auth-token.0=expired-first-chunk; sb-test-auth-token.1=expired-second-chunk; preference=retained" }
    });
    const response = await updateSession(request);
    const forwardedCookies = response.headers.get("x-middleware-request-cookie");
    expect(forwardedCookies).toContain("sb-test-auth-token.0=renewed-first-chunk");
    expect(forwardedCookies).toContain("sb-test-auth-token.1=renewed-second-chunk");
    expect(forwardedCookies).toContain("preference=retained");
    expect(forwardedCookies).not.toContain("expired");
    expect(response.cookies.get("sb-test-auth-token.0")?.value).toBe("renewed-first-chunk");
    expect(response.cookies.get("sb-test-auth-token.1")?.value).toBe("renewed-second-chunk");
  });
});

describe("redirectPreservingCookies", () => {
  it("mantiene el token renovado cuando el middleware redirige", () => {
    const source = NextResponse.next();
    source.cookies.set({
      name: "sb-test-auth-token",
      value: "renewed-session",
      httpOnly: true,
      path: "/",
      sameSite: "lax"
    });

    const redirect = redirectPreservingCookies(
      new URL("https://chetech-admin.vercel.app/dashboard"),
      source
    );

    expect(redirect.headers.get("location")).toBe("https://chetech-admin.vercel.app/dashboard");
    expect(redirect.cookies.get("sb-test-auth-token")).toMatchObject({
      value: "renewed-session",
      httpOnly: true,
      path: "/",
      sameSite: "lax"
    });
  });
});

describe("getSessionRedirectPath", () => {
  it("protege una ruta privada cuando no existe sesion", () => {
    expect(
      getSessionRedirectPath({ hasSession: false, isAuthRoute: false, isProtectedRoute: true })
    ).toBe("/login");
  });

  it("envia una sesion valida del login al dashboard sin consultar el rol", () => {
    expect(
      getSessionRedirectPath({ hasSession: true, isAuthRoute: true, isProtectedRoute: false })
    ).toBe("/dashboard");
  });

  it("deja continuar una sesion valida y delega permisos a la pagina", () => {
    expect(
      getSessionRedirectPath({ hasSession: true, isAuthRoute: false, isProtectedRoute: true })
    ).toBeNull();
  });
});
