import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  profile: vi.fn(),
  rpc: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
import { getRepairQrResponse } from "./qr-gateway";

const id = "00000000-0000-4000-8000-000000000742";
const userId = "00000000-0000-4000-8000-000000000123";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({
    auth: { getUser: mocks.user, getSession: mocks.session },
    from: mocks.from,
    rpc: mocks.rpc,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.profile });
  mocks.profile.mockResolvedValue({
    data: { role: "admin", account_status: "active" },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: {
      id,
      repair_number: "REP-000742",
      customer: { full_name: "PRIVATE CUSTOMER", phone: "3571000000" },
    },
    error: null,
  });
});

async function neutral(result: Response) {
  expect(result.status).toBe(200);
  expect(result.headers.get("Location")).toBeNull();
  const text = await result.text();
  expect(text).toContain("CHETECH");
  expect(text).not.toMatch(
    /PRIVATE CUSTOMER|3571000000|REP-000742|login|iniciar sesi|<form|<script|reparaciones-access/i,
  );
  expect(text).not.toContain(id);
  expect(result.headers.get("Cache-Control")).toMatch(/private.*no-store/);
  expect(result.headers.get("Vary")).toBe("Cookie");
  expect(result.headers.get("X-Robots-Tag")).toContain("noindex");
  expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(result.headers.get("Content-Security-Policy")).toContain(
    "default-src 'none'",
  );
  expect(result.headers.get("Content-Security-Policy")).toContain(
    "frame-ancestors 'none'",
  );
  return text;
}

describe("private repair QR entry", () => {
  it.each(["admin", "tecnico"])(
    "opens the fixed existing order for an active verified %s",
    async (role) => {
      mocks.profile.mockResolvedValue({
        data: { role, account_status: "active" },
        error: null,
      });
      const response = await getRepairQrResponse(id);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        `/reparaciones-access/orden/${id}`,
      );
      expect(response.headers.get("Cache-Control")).toMatch(
        /private.*no-store/,
      );
      expect(mocks.user).toHaveBeenCalledOnce();
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledExactlyOnceWith("profiles");
      expect(mocks.select).toHaveBeenCalledWith("role,account_status");
      expect(mocks.eq).toHaveBeenCalledWith("id", userId);
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        "workshop_order_payload",
        { p_order_id: id },
      );
      expect(await response.text()).not.toContain("PRIVATE CUSTOMER");
    },
  );
  it("shows only branding to an anonymous scanner without reading profiles or repairs", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not trust an auth error even with a cached or forged user", async () => {
    mocks.user.mockResolvedValue({
      data: { user: { id: userId, user_metadata: { role: "admin" } } },
      error: { status: 401 },
    });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { role: "admin", account_status: "disabled" },
    { role: "admin" },
    { role: "customer", account_status: "active" },
    { role: "owner", account_status: "active" },
    null,
  ])("denies profiles outside active staff: %j", async (profile) => {
    mocks.profile.mockResolvedValue({ data: profile, error: null });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not fall back to an unverified session when auth is rate limited", async () => {
    mocks.user.mockResolvedValue({
      data: { user: null },
      error: { status: 429 },
    });
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: userId }, access_token: "forged" } },
    });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("ignores admin claims in editable user metadata", async () => {
    mocks.user.mockResolvedValue({
      data: {
        user: {
          id: userId,
          user_metadata: { role: "admin", account_status: "active" },
        },
      },
      error: null,
    });
    mocks.profile.mockResolvedValue({
      data: { role: "customer", account_status: "active" },
      error: null,
    });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["auth", "profile", "rpc", "client"] as const)(
    "fails closed on %s errors without returning error details",
    async (boundary) => {
      const error = new Error("SECRET INTERNAL ERROR");
      ({
        auth: mocks.user,
        profile: mocks.profile,
        rpc: mocks.rpc,
        client: mocks.client,
      })[boundary].mockRejectedValue(error);
      const body = await neutral(await getRepairQrResponse(id));
      expect(body).not.toContain(error.message);
    },
  );
  it("ignores role data if the profile lookup reports an error", async () => {
    mocks.profile.mockResolvedValue({
      data: { role: "admin", account_status: "active" },
      error: { code: "42501" },
    });
    await neutral(await getRepairQrResponse(id));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: { id }, error: { code: "42501" } },
    { data: { id: userId }, error: null },
  ])(
    "does not open unknown, denied or mismatched orders: %j",
    async (result) => {
      mocks.rpc.mockResolvedValue(result);
      await neutral(await getRepairQrResponse(id));
    },
  );
  it.each(["bad", "https://evil.test", "../dashboard", "<script>", "", null])(
    "rejects malformed identifiers without touching auth: %s",
    async (value) => {
      await neutral(await getRepairQrResponse(value));
      expect(mocks.client).not.toHaveBeenCalled();
    },
  );
  it("returns identical branding for an unknown order and an unauthorized scanner", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const unknown = await neutral(await getRepairQrResponse(id));
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    const denied = await neutral(await getRepairQrResponse(id));
    expect(unknown).toBe(denied);
  });
});
