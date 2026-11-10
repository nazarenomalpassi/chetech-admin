import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn(), rpc: vi.fn(), map: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/features/repairs-access/queries", () => ({ mapOrder: mocks.map }));
vi.mock("@/features/repairs-access/workshop-label-pdf", () => ({ generateWorkshopLabelPdf: mocks.pdf }));
const id = "00000000-0000-4000-8000-000000000742";
const order = { id, repairNumber: "REP-000742", intakeDate: "2026-11-10", issueReported: "Tiene sonido, pero no imagen.", customer: { fullName: "Cliente ejemplo" }, device: { deviceType: "TV", brand: "Samsung", model: "43", accessoryDetails: "Control" } };
const request = (value = id) => GET(new Request(`https://preview.test/api/repair-access/labels/${value}`), { params: Promise.resolve({ id: value }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.permission.mockResolvedValue({ role: "admin" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { id }, error: null });
  mocks.map.mockReturnValue(order);
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-label"));
});

describe("private, read-only workshop labels", () => {
  it("prints the existing number and reported fault with no mutation or numbering call", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("repairs.view");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_order_payload", { p_order_id: id });
    expect(mocks.pdf).toHaveBeenCalledWith({ number: order.repairNumber, customerName: order.customer.fullName, device: "TV - Samsung - 43", issueReported: order.issueReported, accessories: "Control", intakeDate: order.intakeDate, orderUrl: `https://chetech-admin.vercel.app/reparaciones-access?view=detalle&order=${id}` });
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("REP-000742-etiqueta-80x50.pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("%PDF-label");
    await request();
    expect(mocks.rpc.mock.calls.every(([method]) => method === "workshop_order_payload")).toBe(true);
  });
  it("rejects unauthorized access before consulting the order", async () => {
    mocks.permission.mockRejectedValue(new Error("Access denied"));
    expect((await request()).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("validates the order ID and does not invent missing orders", async () => {
    expect((await request("invalid")).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("fails closed on database errors and rendering failures", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private" } });
    expect((await request()).status).toBe(403);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "network" } });
    expect((await request()).status).toBe(503);
    mocks.rpc.mockResolvedValue({ data: { id }, error: null });
    mocks.pdf.mockRejectedValue(new Error("private values"));
    const result = await request();
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("private values");
  });
  it("uses the configured management domain, never an untrusted request host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://gestion.example.com/base");
    await request();
    expect(mocks.pdf.mock.calls[0][0].orderUrl).toBe(`https://gestion.example.com/reparaciones-access?view=detalle&order=${id}`);
  });
});
