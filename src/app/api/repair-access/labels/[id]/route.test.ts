import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn(), rpc: vi.fn(), map: vi.fn(), pdf: vi.fn(), preview: vi.fn(), returns: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/features/repairs-access/queries", () => ({ mapOrder: mocks.map }));
vi.mock("@/features/repairs-access/workshop-label-pdf", () => ({ generateWorkshopLabelPdf: mocks.pdf, generateWorkshopLabelPreview: mocks.preview }));
vi.mock("@/features/repairs-access/warranty-queries", () => ({ getOrderWarrantyReturns: mocks.returns }));
const id = "00000000-0000-4000-8000-000000000742";
const order = { id, repairNumber: "REP-000742", intakeDate: "2026-11-10", issueReported: "Tiene sonido, pero no imagen.", customer: { fullName: "Cliente ejemplo" }, device: { deviceType: "TV", brand: "Samsung", model: "43", accessoryDetails: "Control" } };
const request = (value = id) => GET(new Request(`https://preview.test/api/repair-access/labels/${value}`), { params: Promise.resolve({ id: value }) });
const post = (body: unknown, origin: string | null = "https://preview.test", value = id, contentType = "application/json") => POST(new Request(`https://preview.test/api/repair-access/labels/${value}`, {
  method: "POST", headers: { "Content-Type": contentType, ...(origin === null ? {} : { Origin: origin }) }, body: JSON.stringify(body)
}), { params: Promise.resolve({ id: value }) });
const activeReturn = { id: "00000000-0000-4000-8000-000000000123", orderId: id, receivedOn: "2026-11-15", issueReported: "Sin sonido otra vez", accessories: "Cable nuevo", status: "en_revision", closedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.permission.mockResolvedValue({ role: "admin" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { id }, error: null });
  mocks.map.mockReturnValue(order);
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-label"));
  mocks.preview.mockResolvedValue({ pdf: Buffer.from("%PDF-label"), accessoryDescriptionTruncated: false });
  mocks.returns.mockResolvedValue([activeReturn]);
});

describe("private, read-only workshop labels", () => {
  it("reads a customized accessory only from a validated POST body without changing the order", async () => {
    const result = await post({ variant: "accessory", accessoryDescription: "  Control remoto negro  ", accessoryIndex: 2 });
    expect(result.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("repairs.view");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("workshop_order_payload", { p_order_id: id });
    expect(mocks.returns).not.toHaveBeenCalled();
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ number: order.repairNumber, variant: "accessory", accessoryDescription: "Control remoto negro", accessoryIndex: 2, orderUrl: `https://chetech-admin.vercel.app/reparaciones-access?view=detalle&order=${id}` }));
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.get("Content-Disposition")).toContain("accesorio-A2-80x50.pdf");
    expect(result.headers.get("X-CHETECH-Accessory-Truncated")).toBe("0");
  });
  it("returns a private fit warning from the renderer without putting the temporary text in a URL", async () => {
    mocks.preview.mockResolvedValue({ pdf: Buffer.from("%PDF-label"), accessoryDescriptionTruncated: true });
    const result = await post({ variant: "accessory", accessoryDescription: "W".repeat(120), accessoryIndex: 1 });
    expect(result.status).toBe(200);
    expect(result.headers.get("X-CHETECH-Accessory-Truncated")).toBe("1");
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect((await post({ variant: "accessory", accessoryDescription: "W".repeat(121), accessoryIndex: 1 })).status).toBe(400);
    expect(mocks.preview).toHaveBeenCalledOnce();
  });
  it("requires permission before reading data for customized labels", async () => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    expect((await post({ variant: "warranty" })).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.returns).not.toHaveBeenCalled();
  });
  it.each([null, "null", "https://foreign.test", "https://preview.test.evil.test"])("rejects a non-same-origin POST (%s) before reading private data", async origin => {
    expect((await post({ variant: "warranty" }, origin)).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.returns).not.toHaveBeenCalled();
  });
  it.each([
    { variant: "other" }, { variant: "accessory" }, { variant: "accessory", accessoryDescription: " ", accessoryIndex: 1 },
    { variant: "accessory", accessoryDescription: "Cable", accessoryIndex: 0 }, { variant: "accessory", accessoryDescription: "Cable", accessoryIndex: 100 },
    { variant: "accessory", accessoryDescription: "Cable", accessoryIndex: 1.5 }, { variant: "accessory", accessoryDescription: "x".repeat(501), accessoryIndex: 1 },
    { variant: "warranty", issueReported: "Not trusted" }
  ])("validates customized fields without accepting replacements for saved order data: %j", async body => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("validates ID, media type, size and malformed JSON before reading data", async () => {
    expect((await post({ variant: "warranty" }, "https://preview.test", "invalid")).status).toBe(400);
    expect((await post({ variant: "warranty" }, "https://preview.test", id, "text/plain")).status).toBe(415);
    expect((await post({ variant: "accessory", accessoryDescription: "x".repeat(5000), accessoryIndex: 1 })).status).toBe(413);
    const malformed = new Request(`https://preview.test/api/repair-access/labels/${id}`, { method: "POST", headers: { Origin: "https://preview.test", "Content-Type": "application/json" }, body: "{" });
    expect((await POST(malformed, { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses the active warranty visit, not original or closed-return data, with the original REP and URL", async () => {
    mocks.returns.mockResolvedValue([{ ...activeReturn, closedAt: "2026-11-16", status: "retirado", issueReported: "Closed" }, { ...activeReturn, orderId: "another-order", issueReported: "Other order" }, activeReturn]);
    expect((await post({ variant: "warranty" })).status).toBe(200);
    expect(mocks.returns).toHaveBeenCalledExactlyOnceWith([id]);
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ number: order.repairNumber, variant: "warranty", issueReported: activeReturn.issueReported, intakeDate: activeReturn.receivedOn, accessories: activeReturn.accessories, orderUrl: `https://chetech-admin.vercel.app/reparaciones-access?view=detalle&order=${id}` }));
  });
  it("does not print the old order as a warranty return when none is active", async () => {
    mocks.returns.mockResolvedValue([{ ...activeReturn, closedAt: "2026-11-16", status: "retirado" }]);
    const result = await post({ variant: "warranty" });
    expect(result.status).toBe(409);
    expect(await result.text()).toContain("reingreso");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("fails closed if the warranty read fails and never leaks its underlying error", async () => {
    mocks.returns.mockRejectedValue(new Error("private details"));
    const result = await post({ variant: "warranty" });
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private details");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("keeps equipment POST data equivalent to the original GET and ignores no sensitive query variants", async () => {
    await post({ variant: "equipment" });
    const generated = mocks.pdf.mock.calls[0][0];
    mocks.pdf.mockClear();
    await GET(new Request(`https://preview.test/api/repair-access/labels/${id}?variant=accessory&accessoryDescription=ShouldNotPrint`), { params: Promise.resolve({ id }) });
    expect(mocks.pdf.mock.calls[0][0]).toEqual(generated);
    expect(generated.issueReported).toBe(order.issueReported);
    expect(mocks.returns).not.toHaveBeenCalled();
  });
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
