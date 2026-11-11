import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseEnv: () => true,
  getSupabasePublicKey: () => "test-public-key",
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getSession: mocks.session } }),
}));
import { updateSession } from "./middleware";
beforeEach(() => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: null });
});
describe("QR routing does not expose the administrative login", () => {
  it.each([
    "/q",
    "/q/00000000-0000-4000-8000-000000000742",
    "/q/invalid",
    "/brand/qr-landing.css",
    "/brand/document-logo-white.png",
  ])("allows only the neutral QR entry and branding for %s", async (path) => {
    const response = await updateSession(
      new NextRequest(`https://chetech-admin.vercel.app${path}`),
    );
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it.each([
    "/dashboard",
    "/reparaciones-access",
    "/q-other",
    "/reparaciones-access/orden/00000000-0000-4000-8000-000000000742",
  ])("keeps unrelated private path protected: %s", async (path) => {
    const response = await updateSession(
      new NextRequest(`https://chetech-admin.vercel.app${path}`),
    );
    expect(response.headers.get("Location")).toBe(
      "https://chetech-admin.vercel.app/login",
    );
  });
});

describe("legacy printed QR middleware classification", () => {
  const id = "00000000-0000-4000-8000-000000000742";
  const origin = "https://chetech-admin.vercel.app";
  const legacyUrl = `${origin}/reparaciones-access?view=detalle&order=${id}`;

  it.each(["GET", "HEAD"])(
    "allows an anonymous legacy %s scan to reach the neutral gateway",
    async (method) => {
      const response = await updateSession(
        new NextRequest(legacyUrl, {
          method,
          headers: { accept: "text/html", "sec-fetch-dest": "document" },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  const privateRequests: [string, string, Record<string, string>][] = [
    ["RSC navigation", "GET", { rsc: "1" }],
    [
      "Server Action POST without Content-Type",
      "POST",
      { "next-action": "test-action", accept: "text/x-component" },
    ],
    [
      "native URL-encoded form POST without Next-Action",
      "POST",
      { "content-type": "application/x-www-form-urlencoded" },
    ],
    [
      "native multipart form POST without Next-Action",
      "POST",
      { "content-type": "multipart/form-data; boundary=test-boundary" },
    ],
    [
      "Content-Type-only GET",
      "GET",
      { "content-type": "application/json" },
    ],
    ["Next-Action-only HEAD", "HEAD", { "next-action": "test-action" }],
    ["headerless POST", "POST", {}],
  ];

  it.each(privateRequests)(
    "keeps ordinary authentication protection for %s",
    async (_name, method, headers) => {
      const response = await updateSession(
        new NextRequest(legacyUrl, { method, headers }),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(`${origin}/login`);
    },
  );

  it.each([
    "status", "error", "q", "state", "warranty", "scope", "cursor", "wq", "wp",
    "wh", "pp", "pq", "pf", "pc", "cp", "from", "to", "unknown_context",
  ])("keeps a contextual legacy GET private when it contains %s", async (key) => {
    const response = await updateSession(
      new NextRequest(`${legacyUrl}&${key}=retained-value`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(`${origin}/login`);
  });

  it.each(["view=detalle", `order=${id}`])(
    "does not exempt a legacy URL with a duplicate query parameter: %s",
    async (duplicate) => {
      const response = await updateSession(
        new NextRequest(`${legacyUrl}&${duplicate}`),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(`${origin}/login`);
    },
  );

  it.each([
    `/reparaciones-access?view=ordenes&order=${id}`,
    `/reparaciones-access?order=${id}`,
    "/reparaciones-access?view=detalle",
    "/reparaciones-access?view=detalle&order=invalid",
    `/reparaciones-access/other?view=detalle&order=${id}`,
    `/reparaciones-access/orden/${id}?view=detalle&order=${id}`,
  ])("does not exempt a non-legacy private URL: %s", async (path) => {
    const response = await updateSession(new NextRequest(`${origin}${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(`${origin}/login`);
  });
});
